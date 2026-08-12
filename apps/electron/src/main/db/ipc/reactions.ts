import { ipcMain } from "electron";
import { getDb } from "../connection";
import { normalizeMessageRow, attachReactionsToRow } from "../normalizers";

export function registerReactionHandlers() {
  ipcMain.handle("db:apply-message-reaction", (event, payload) => {
    const db = getDb();
    const serverMessageId = String(payload?.serverMessageId ?? "");
    const userId = Number(payload?.userId);
    const action = String(payload?.action ?? "");
    const emoji =
      payload?.emoji === null || payload?.emoji === undefined
        ? null
        : String(payload.emoji);
    const updatedAt =
      payload?.updatedAt && typeof payload.updatedAt === "string"
        ? payload.updatedAt
        : new Date().toISOString();
    // Sequence is optional for backward compatibility with callers that
    // pre-date the delta protocol. When supplied (>0) we use it for
    // idempotency: stale events whose sequence is not strictly greater than
    // the stored one are dropped silently.
    const sequence = Number.isFinite(Number(payload?.sequence))
      ? Number(payload.sequence)
      : 0;
    const isDeleted =
      action === "removed" || !emoji || Number(payload?.isDeleted) === 1;

    if (!serverMessageId || !Number.isFinite(userId) || userId <= 0) {
      return false;
    }

    const messageRow = db
      .prepare(
        `
        SELECT client_message_id
        FROM local_messages
        WHERE CAST(server_message_id AS text) = ?
        LIMIT 1
        `
      )
      .get(serverMessageId) as { client_message_id?: string } | undefined;

    if (!messageRow?.client_message_id) {
      return false;
    }

    const clientMessageId = messageRow.client_message_id;

    if (sequence > 0) {
      const existing = db
        .prepare(
          `
          SELECT sequence
          FROM local_message_reactions
          WHERE client_message_id = ? AND user_id = ?
          `
        )
        .get(clientMessageId, userId) as { sequence?: number } | undefined;
      if (existing && Number(existing.sequence ?? 0) >= sequence) {
        return false;
      }
    }

    if (isDeleted) {
      // Tombstone-style upsert: keep the row so a freshly woken delta puller
      // observes the removal and the per-conversation cursor stays advancing.
      db.prepare(
        `
        INSERT INTO local_message_reactions (
          client_message_id, user_id, emoji, created_at, updated_at, sequence, is_deleted
        ) VALUES (?, ?, ?, ?, ?, ?, 1)
        ON CONFLICT(client_message_id, user_id) DO UPDATE SET
          emoji = excluded.emoji,
          updated_at = excluded.updated_at,
          sequence = CASE
            WHEN excluded.sequence > local_message_reactions.sequence
            THEN excluded.sequence
            ELSE local_message_reactions.sequence
          END,
          is_deleted = 1
        `
      ).run(
        clientMessageId,
        userId,
        emoji ?? "",
        updatedAt,
        updatedAt,
        sequence
      );
    } else {
      db.prepare(
        `
        INSERT INTO local_message_reactions (
          client_message_id, user_id, emoji, created_at, updated_at, sequence, is_deleted
        ) VALUES (?, ?, ?, ?, ?, ?, 0)
        ON CONFLICT(client_message_id, user_id) DO UPDATE SET
          emoji = excluded.emoji,
          updated_at = excluded.updated_at,
          sequence = CASE
            WHEN excluded.sequence > local_message_reactions.sequence
            THEN excluded.sequence
            ELSE local_message_reactions.sequence
          END,
          is_deleted = 0
        `
      ).run(clientMessageId, userId, emoji, updatedAt, updatedAt, sequence);
    }

    const fullMsg = db
      .prepare(
        `
        SELECT m.client_message_id, CAST(m.server_message_id AS text) AS server_message_id, m.client_conversation_id,
        m.sequence, m.sender_id, m.content, m.type, m.created_at, m.updated_at, m.status, m.is_recalled,
        m.is_favorited, m.is_pinned,
        m.reply_to_message_id, m.reply_to_sender_id, m.reply_to_sender_nickname, m.reply_to_text,
        om.last_error,
        COALESCE(cm.nickname, m.sender_nickname) AS sender_nickname,
        COALESCE(cm.avatar_url, m.sender_avatar) AS sender_avatar
        FROM local_messages m
        LEFT JOIN local_conversation_members cm
          ON m.client_conversation_id = cm.conversation_id
         AND m.sender_id = cm.user_id
        LEFT JOIN outgoing_messages om
          ON m.client_message_id = om.client_message_id
        WHERE m.client_message_id = ?
        `
      )
      .get(clientMessageId) as
      | { client_conversation_id?: string; client_message_id?: string }
      | undefined;

    if (!fullMsg) {
      return false;
    }

    // Advance the per-conversation reaction cursor so subsequent delta pulls
    // skip events we just applied via the live channel. The cursor is stored
    // keyed on `client_conversation_id` (mirroring `local_reaction_cursors`'s
    // primary key) and is monotonically non-decreasing.
    if (sequence > 0 && fullMsg.client_conversation_id) {
      db.prepare(
        `
        INSERT INTO local_reaction_cursors (
          client_conversation_id, last_sequence, updated_at
        ) VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(client_conversation_id) DO UPDATE SET
          last_sequence = CASE
            WHEN excluded.last_sequence > local_reaction_cursors.last_sequence
            THEN excluded.last_sequence
            ELSE local_reaction_cursors.last_sequence
          END,
          updated_at = CURRENT_TIMESTAMP
        `
      ).run(String(fullMsg.client_conversation_id), sequence);
    }

    event.sender.send(
      "db:message-updated",
      normalizeMessageRow(attachReactionsToRow(fullMsg))
    );
    return true;
  });

  /**
   * Apply an ordered batch of reaction delta events for a single conversation.
   * Mirrors the JSON repository's `applyReactionDeltas` semantics: tombstones
   * become `is_deleted=1` rows, active events upsert with the higher sequence,
   * and the per-conversation cursor advances to the max applied sequence.
   *
   * Payload shape: `{ clientConversationId: string, deltas: Array<{ serverMessageId, userId, emoji, sequence, isDeleted, updatedAt }> }`.
   */
  ipcMain.handle("db:apply-message-reaction-deltas", (event, payload) => {
    const db = getDb();
    const clientConversationId = String(payload?.clientConversationId ?? "");
    const deltas: Array<{
      serverMessageId: string;
      userId: number;
      emoji: string | null;
      sequence: number;
      isDeleted: 0 | 1;
      updatedAt: string;
    }> = Array.isArray(payload?.deltas) ? payload.deltas : [];

    if (!clientConversationId || deltas.length === 0) {
      return { applied: 0, maxSequence: 0 };
    }

    // Resolve all server -> client message id mappings up front so we don't
    // pay a query per delta in the hot path.
    const uniqueServerIds = Array.from(
      new Set(deltas.map(item => String(item.serverMessageId)).filter(Boolean))
    );
    if (uniqueServerIds.length === 0) {
      return { applied: 0, maxSequence: 0 };
    }
    const placeholders = uniqueServerIds.map(() => "?").join(",");
    const idRows = db
      .prepare(
        `
        SELECT client_message_id, CAST(server_message_id AS text) AS server_message_id
        FROM local_messages
        WHERE CAST(server_message_id AS text) IN (${placeholders})
        `
      )
      .all(...uniqueServerIds) as Array<{
      client_message_id: string;
      server_message_id: string;
    }>;
    const idMap = new Map<string, string>();
    for (const row of idRows) {
      idMap.set(String(row.server_message_id), String(row.client_message_id));
    }

    const upsertStmt = db.prepare(`
      INSERT INTO local_message_reactions (
        client_message_id, user_id, emoji, created_at, updated_at, sequence, is_deleted
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(client_message_id, user_id) DO UPDATE SET
        emoji = excluded.emoji,
        updated_at = excluded.updated_at,
        sequence = CASE
          WHEN excluded.sequence > local_message_reactions.sequence
          THEN excluded.sequence
          ELSE local_message_reactions.sequence
        END,
        is_deleted = CASE
          WHEN excluded.sequence > local_message_reactions.sequence
          THEN excluded.is_deleted
          ELSE local_message_reactions.is_deleted
        END
    `);
    const existingStmt = db.prepare(
      `SELECT sequence FROM local_message_reactions WHERE client_message_id = ? AND user_id = ?`
    );
    const cursorStmt = db.prepare(`
      INSERT INTO local_reaction_cursors (
        client_conversation_id, last_sequence, updated_at
      ) VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(client_conversation_id) DO UPDATE SET
        last_sequence = CASE
          WHEN excluded.last_sequence > local_reaction_cursors.last_sequence
          THEN excluded.last_sequence
          ELSE local_reaction_cursors.last_sequence
        END,
        updated_at = CURRENT_TIMESTAMP
    `);

    let applied = 0;
    let maxSequence = 0;
    const updatedClientMessageIds = new Set<string>();

    const apply = db.transaction(() => {
      // Caller is expected to hand us events in ascending sequence; defensive
      // sort guards us against bugs in the repository layer.
      const ordered = [...deltas].sort(
        (left, right) => Number(left.sequence) - Number(right.sequence)
      );
      for (const delta of ordered) {
        const clientMessageId = idMap.get(String(delta.serverMessageId));
        if (!clientMessageId) continue;
        const userId = Number(delta.userId);
        if (!Number.isFinite(userId) || userId <= 0) continue;
        const sequence = Number(delta.sequence ?? 0);
        if (sequence <= 0) continue;
        const existing = existingStmt.get(clientMessageId, userId) as
          | { sequence?: number }
          | undefined;
        if (existing && Number(existing.sequence ?? 0) >= sequence) {
          continue;
        }
        const isDeleted = delta.isDeleted === 1 ? 1 : 0;
        const emoji = isDeleted ? "" : String(delta.emoji ?? "");
        if (!isDeleted && !emoji) continue;
        const updatedAt =
          typeof delta.updatedAt === "string" && delta.updatedAt
            ? delta.updatedAt
            : new Date().toISOString();
        upsertStmt.run(
          clientMessageId,
          userId,
          emoji,
          updatedAt,
          updatedAt,
          sequence,
          isDeleted
        );
        applied += 1;
        if (sequence > maxSequence) {
          maxSequence = sequence;
        }
        updatedClientMessageIds.add(clientMessageId);
      }
      if (maxSequence > 0) {
        cursorStmt.run(clientConversationId, maxSequence);
      }
    });
    apply();

    // Notify renderer of every touched message so reaction capsules re-render.
    for (const clientMessageId of updatedClientMessageIds) {
      const fullMsg = db
        .prepare(
          `
          SELECT m.client_message_id, CAST(m.server_message_id AS text) AS server_message_id, m.client_conversation_id,
          m.sequence, m.sender_id, m.content, m.type, m.created_at, m.updated_at, m.status, m.is_recalled,
          m.is_favorited, m.is_pinned,
          m.reply_to_message_id, m.reply_to_sender_id, m.reply_to_sender_nickname, m.reply_to_text,
          om.last_error,
          COALESCE(cm.nickname, m.sender_nickname) AS sender_nickname,
          COALESCE(cm.avatar_url, m.sender_avatar) AS sender_avatar
          FROM local_messages m
          LEFT JOIN local_conversation_members cm
            ON m.client_conversation_id = cm.conversation_id
           AND m.sender_id = cm.user_id
          LEFT JOIN outgoing_messages om
            ON m.client_message_id = om.client_message_id
          WHERE m.client_message_id = ?
          `
        )
        .get(clientMessageId);
      if (fullMsg) {
        event.sender.send(
          "db:message-updated",
          normalizeMessageRow(attachReactionsToRow(fullMsg))
        );
      }
    }

    return { applied, maxSequence };
  });

  /** Read the per-conversation reaction sync cursor. */
  ipcMain.handle(
    "db:get-reaction-cursor",
    (_event, clientConversationId: string) => {
      if (!clientConversationId) {
        return 0;
      }
      const row = getDb()
        .prepare(
          `SELECT last_sequence FROM local_reaction_cursors WHERE client_conversation_id = ?`
        )
        .get(String(clientConversationId)) as
        | { last_sequence?: number }
        | undefined;
      return Number(row?.last_sequence ?? 0);
    }
  );

  /** Persist the per-conversation reaction sync cursor (monotonically non-decreasing). */
  ipcMain.handle(
    "db:set-reaction-cursor",
    (_event, clientConversationId: string, sequence: number) => {
      const id = String(clientConversationId ?? "");
      const next = Number(sequence ?? 0);
      if (!id || !Number.isFinite(next) || next <= 0) {
        return false;
      }
      getDb()
        .prepare(
          `
          INSERT INTO local_reaction_cursors (
            client_conversation_id, last_sequence, updated_at
          ) VALUES (?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(client_conversation_id) DO UPDATE SET
            last_sequence = CASE
              WHEN excluded.last_sequence > local_reaction_cursors.last_sequence
              THEN excluded.last_sequence
              ELSE local_reaction_cursors.last_sequence
            END,
            updated_at = CURRENT_TIMESTAMP
          `
        )
        .run(id, next);
      return true;
    }
  );

  ipcMain.handle("db:replace-message-reactions", (_event, payload) => {
    const serverMessageIds: string[] = Array.isArray(payload?.serverMessageIds)
      ? payload.serverMessageIds.map((id: unknown) => String(id))
      : [];
    const reactions: Array<{
      serverMessageId: string;
      userId: number;
      emoji: string;
      updatedAt: string;
    }> = Array.isArray(payload?.reactions) ? payload.reactions : [];
    if (serverMessageIds.length === 0) {
      return true;
    }
    const db = getDb();
    const placeholders = serverMessageIds.map(() => "?").join(",");
    const messageRows = db
      .prepare(
        `
          SELECT client_message_id, CAST(server_message_id AS text) AS server_message_id
          FROM local_messages
          WHERE CAST(server_message_id AS text) IN (${placeholders})
          `
      )
      .all(...serverMessageIds) as Array<{
      client_message_id: string;
      server_message_id: string;
    }>;
    const idMap = new Map<string, string>();
    for (const row of messageRows) {
      idMap.set(String(row.server_message_id), String(row.client_message_id));
    }
    const knownClientIds = Array.from(idMap.values());
    if (knownClientIds.length === 0) {
      return true;
    }
    const deleteStmt = db.prepare(
      `DELETE FROM local_message_reactions WHERE client_message_id = ?`
    );
    const upsertStmt = db.prepare(`
        INSERT INTO local_message_reactions (
          client_message_id, user_id, emoji, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(client_message_id, user_id) DO UPDATE SET
          emoji = excluded.emoji,
          updated_at = excluded.updated_at
      `);
    const apply = db.transaction(() => {
      for (const clientMessageId of knownClientIds) {
        deleteStmt.run(clientMessageId);
      }
      for (const reaction of reactions) {
        const clientMessageId = idMap.get(String(reaction.serverMessageId));
        if (!clientMessageId) continue;
        const userId = Number(reaction.userId);
        const emoji = reaction.emoji ? String(reaction.emoji) : "";
        if (!Number.isFinite(userId) || userId <= 0 || !emoji) continue;
        const updatedAt =
          reaction.updatedAt && typeof reaction.updatedAt === "string"
            ? reaction.updatedAt
            : new Date().toISOString();
        upsertStmt.run(clientMessageId, userId, emoji, updatedAt, updatedAt);
      }
    });
    apply();
    return true;
  });
}
