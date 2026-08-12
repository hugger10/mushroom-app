import { getDb } from "./connection";
import { SELECT_BY_CLIENT_ID_CHUNK } from "./shared";

export function normalizeSyncCursorValue(syncTime: unknown): string | null {
  if (syncTime == null) {
    return null;
  }

  if (syncTime instanceof Date) {
    return syncTime.toISOString();
  }

  if (
    typeof syncTime === "string" ||
    typeof syncTime === "number" ||
    typeof syncTime === "bigint"
  ) {
    return String(syncTime);
  }

  if (
    typeof syncTime === "object" &&
    syncTime !== null &&
    "toISOString" in syncTime &&
    typeof (syncTime as { toISOString?: unknown }).toISOString === "function"
  ) {
    return (syncTime as { toISOString: () => string }).toISOString();
  }

  return JSON.stringify(syncTime);
}

export function normalizeContactRecord(contact: Record<string, unknown>) {
  return {
    user_id: contact.user_id,
    username: contact.username ?? null,
    nickname: contact.nickname ?? null,
    remark_name: contact.remark_name ?? null,
    remark_note: contact.remark_note ?? null,
    avatar_url: contact.avatar_url ?? null,
    gender: Number(contact.gender ?? 0),
    source: contact.source ?? null,
    status: contact.status ?? "normal",
    is_blocked:
      contact.is_blocked === undefined || contact.is_blocked === null
        ? Number(contact.status ?? 0) === 4
          ? 1
          : 0
        : contact.is_blocked
          ? 1
          : 0,
    signature: contact.signature ?? null,
    blocked_at:
      contact.blocked_at ??
      (Number(contact.status ?? 0) === 4 ? (contact.updated_at ?? null) : null),
    updated_at: contact.updated_at ?? new Date().toISOString()
  };
}

export function normalizeConversationRecordForWrite(
  conversation: Record<string, any>
) {
  const lastSyncSequence = Number(conversation.last_sync_sequence ?? 0);
  const lastServerSequence = Number(
    conversation.last_server_sequence ?? lastSyncSequence
  );
  const tailLoadedToSequence = Number(
    conversation.tail_loaded_to_seq ?? lastSyncSequence
  );
  const tailLoadedFromSequence =
    conversation.tail_loaded_from_seq !== undefined
      ? Number(conversation.tail_loaded_from_seq ?? 0)
      : tailLoadedToSequence > 0
        ? 1
        : 0;
  const historyComplete =
    conversation.history_complete !== undefined
      ? Number(conversation.history_complete ?? 0)
      : tailLoadedFromSequence > 0 && tailLoadedFromSequence <= 1
        ? 1
        : 0;
  const needsBackfill =
    conversation.needs_backfill !== undefined
      ? Number(conversation.needs_backfill ?? 0)
      : lastServerSequence > tailLoadedToSequence || historyComplete === 0
        ? 1
        : 0;

  return {
    ...conversation,
    last_server_sequence: lastServerSequence,
    sync_gap_detected:
      conversation.sync_gap_detected ??
      (lastServerSequence > lastSyncSequence || historyComplete === 0 ? 1 : 0),
    tail_loaded_from_seq: tailLoadedFromSequence,
    tail_loaded_to_seq: tailLoadedToSequence,
    history_complete: historyComplete,
    needs_backfill: needsBackfill,
    peer_last_read_sequence: Number(conversation.peer_last_read_sequence ?? 0),
    local_hidden_before_seq:
      conversation.local_hidden_before_seq === undefined
        ? undefined
        : Number(conversation.local_hidden_before_seq ?? 0),
    is_locally_deleted:
      conversation.is_locally_deleted === undefined
        ? undefined
        : Number(conversation.is_locally_deleted ?? 0),
    last_message_content: JSON.stringify(
      conversation.last_message_content ?? {}
    )
  };
}

export function normalizeMessageRow(row: any) {
  return {
    ...row,
    content: JSON.parse(row.content),
    is_favorited: Number(row.is_favorited ?? 0),
    is_pinned: Number(row.is_pinned ?? 0),
    reactions: Array.isArray(row.reactions) ? row.reactions : [],
    reply_to:
      row.reply_to_message_id && row.reply_to_sender_id
        ? {
            message_id: row.reply_to_message_id,
            sender_id: row.reply_to_sender_id,
            sender_nickname: row.reply_to_sender_nickname || undefined,
            text: row.reply_to_text || "[Quoted message]"
          }
        : null
  };
}

export function loadReactionsForMessageIds(messageIds: string[]): Map<
  string,
  Array<{
    user_id: number;
    emoji: string;
    updated_at: string;
    sequence: number;
  }>
> {
  const map = new Map<
    string,
    Array<{
      user_id: number;
      emoji: string;
      updated_at: string;
      sequence: number;
    }>
  >();
  if (!messageIds.length) {
    return map;
  }
  const placeholders = messageIds.map(() => "?").join(",");
  // Filter out tombstones at read time. We keep them in the table so a
  // freshly woken client that missed the WS broadcast can still observe the
  // removal once the delta cursor catches up; the rendering layer never
  // sees them.
  const rows = getDb()
    .prepare(
      `
      SELECT client_message_id, user_id, emoji, updated_at, sequence
      FROM local_message_reactions
      WHERE client_message_id IN (${placeholders})
        AND is_deleted = 0
      ORDER BY updated_at ASC
      `
    )
    .all(...messageIds) as Array<{
    client_message_id: string;
    user_id: number;
    emoji: string;
    updated_at: string;
    sequence: number;
  }>;
  for (const row of rows) {
    const list = map.get(row.client_message_id) ?? [];
    list.push({
      user_id: Number(row.user_id),
      emoji: String(row.emoji),
      updated_at: String(row.updated_at),
      sequence: Number(row.sequence ?? 0)
    });
    map.set(row.client_message_id, list);
  }
  return map;
}

export function attachReactionsToRows(rows: any[]): any[] {
  if (!rows || rows.length === 0) {
    return rows;
  }
  const ids = rows
    .map(row => String(row?.client_message_id || ""))
    .filter(Boolean);
  if (!ids.length) {
    return rows;
  }
  const reactionMap = loadReactionsForMessageIds(ids);
  for (const row of rows) {
    const id = String(row?.client_message_id || "");
    row.reactions = reactionMap.get(id) ?? [];
  }
  return rows;
}

export function attachReactionsToRow<
  T extends { client_message_id?: string } | null | undefined
>(row: T): T {
  if (!row || !row.client_message_id) {
    return row;
  }
  const reactionMap = loadReactionsForMessageIds([
    String(row.client_message_id)
  ]);
  (row as any).reactions = reactionMap.get(String(row.client_message_id)) ?? [];
  return row;
}

export function normalizeMessageRows(rows: any[]) {
  return attachReactionsToRows(rows).map(normalizeMessageRow);
}

/**
 * Look up `local_messages` rows by `client_message_id` in safely sized
 * chunks. Returns rows in the same shape as the inline SELECTs used by the
 * sync handlers — `normalizeMessageRows` is applied by the caller.
 */
export function selectMessagesByClientIds(clientMessageIds: string[]): any[] {
  if (clientMessageIds.length === 0) {
    return [];
  }
  const db = getDb();
  const aggregated: any[] = [];
  for (let i = 0; i < clientMessageIds.length; i += SELECT_BY_CLIENT_ID_CHUNK) {
    const chunk = clientMessageIds.slice(i, i + SELECT_BY_CLIENT_ID_CHUNK);
    const placeholders = chunk.map(() => "?").join(",");
    const rows = db
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
        WHERE m.client_message_id IN (${placeholders})
        `
      )
      .all(...chunk) as any[];
    if (rows.length > 0) {
      aggregated.push(...rows);
    }
  }
  return aggregated;
}
