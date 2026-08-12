import { ipcMain } from "electron";
import {
  isMentioningUser,
  type ConversationSyncPayload,
  type MessageSyncPayload
} from "@mushroom/shared";
import { getDb } from "../connection";
import { store } from "../..";
import log from "../../../utils/log";
import { fmtCount, SELECT_BY_CLIENT_ID_CHUNK } from "../shared";
import {
  normalizeMessageRow,
  normalizeMessageRows,
  attachReactionsToRow,
  selectMessagesByClientIds
} from "../normalizers";
import {
  shouldStoreConversationMessage,
  reconcileConversationSyncProgress
} from "../conversation-sync";

export function registerMessagesWriteHandlers() {
  ipcMain.handle("db:create-messages", (event, messages) => {
    const msgArray = Array.isArray(messages) ? messages : [messages];
    log.debug("Sync server creating messages " + fmtCount(msgArray));
    const insertSql = `
    INSERT INTO local_messages (
      client_message_id,
      server_message_id, 
      client_conversation_id,
      sequence,
      sender_id, 
      sender_nickname,
      sender_avatar,
      content, 
      type,
      created_at,  
      updated_at,
      status,
      is_recalled,
      is_favorited,
      is_pinned,
      reply_to_message_id,
      reply_to_sender_id,
      reply_to_sender_nickname,
      reply_to_text
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(client_message_id) DO UPDATE SET
      server_message_id = excluded.server_message_id,
      client_conversation_id = excluded.client_conversation_id,
      sequence = CASE
        WHEN COALESCE(excluded.sequence, 0) > COALESCE(local_messages.sequence, 0)
        THEN excluded.sequence
        ELSE local_messages.sequence
      END,
      sender_id = excluded.sender_id,
      sender_nickname = COALESCE(
        excluded.sender_nickname,
        local_messages.sender_nickname
      ),
      sender_avatar = COALESCE(
        excluded.sender_avatar,
        local_messages.sender_avatar
      ),
      content = excluded.content,
      type = excluded.type,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      status = excluded.status,
      is_recalled = excluded.is_recalled,
      is_favorited = COALESCE(excluded.is_favorited, local_messages.is_favorited),
      is_pinned = COALESCE(excluded.is_pinned, local_messages.is_pinned),
      reply_to_message_id = excluded.reply_to_message_id,
      reply_to_sender_id = excluded.reply_to_sender_id,
      reply_to_sender_nickname = excluded.reply_to_sender_nickname,
      reply_to_text = excluded.reply_to_text
  `;

    const stmt = getDb().prepare(insertSql);
    // NOTE: Reactions are intentionally NOT written from `db:create-messages`.
    // Historically this handler honoured the `reactions` array on the incoming
    // payload, but the DTO that funnels here from `/message/sync` increasingly
    // omits the field (`server/src/utils/dto.ts`), causing
    // `apps/web/src/utils/mapper.ts` to substitute an empty array. The combined
    // effect was that paginating older history would wipe locally-stored
    // reactions even when the server still considered them active. Reactions
    // now flow exclusively through the per-conversation delta channel
    // (`db:apply-message-reaction-delta(s)`); this writer must stay reaction-
    // free to avoid regressing that data path.

    const insertMany = getDb().transaction(msgs => {
      for (const m of msgs) {
        if (
          !shouldStoreConversationMessage(
            getDb(),
            String(m.client_conversation_id || ""),
            Number(m.sequence || 0)
          )
        ) {
          continue;
        }
        try {
          stmt.run(
            m.client_message_id,
            m.server_message_id,
            m.client_conversation_id,
            m.sequence,
            m.sender_id,
            m.sender_nickname ?? null,
            m.sender_avatar ?? null,
            JSON.stringify(m.content),
            m.type,
            m.created_at,
            m.updated_at ?? m.created_at,
            m.status,
            m.is_recalled || 0,
            m.is_favorited || 0,
            m.is_pinned || 0,
            m.reply_to_message_id || null,
            m.reply_to?.sender_id || null,
            m.reply_to?.sender_nickname || null,
            m.reply_to?.text || null
          );
        } catch (error) {
          log.warn("Skip duplicated synced message", {
            client_message_id: m.client_message_id,
            server_message_id: m.server_message_id,
            error
          });
        }
      }
    });

    try {
      insertMany(msgArray);
      const syncProgressByConversation = new Map<string, number>();
      for (const message of msgArray) {
        const clientConversationId = String(
          message.client_conversation_id || ""
        );
        const sequence = Number(message.sequence || 0);
        if (!clientConversationId || sequence <= 0) {
          continue;
        }
        const previous =
          syncProgressByConversation.get(clientConversationId) ?? 0;
        if (sequence > previous) {
          syncProgressByConversation.set(clientConversationId, sequence);
        }
      }
      const db = getDb();
      for (const [
        clientConversationId,
        serverSequence
      ] of syncProgressByConversation) {
        reconcileConversationSyncProgress(
          db,
          clientConversationId,
          serverSequence
        );
      }

      const messagesByConversation = new Map<string, string[]>();
      for (const message of msgArray) {
        const clientConversationId = String(
          message.client_conversation_id || ""
        );
        const clientMessageId = String(message.client_message_id || "");
        if (!clientConversationId || !clientMessageId) {
          continue;
        }
        const bucket = messagesByConversation.get(clientConversationId);
        if (bucket) {
          bucket.push(clientMessageId);
        } else {
          messagesByConversation.set(clientConversationId, [clientMessageId]);
        }
      }
      for (const [
        clientConversationId,
        clientMessageIds
      ] of messagesByConversation) {
        const rows = selectMessagesByClientIds(clientMessageIds);
        const upsertedMessages = normalizeMessageRows(rows);
        event.sender.send("message-sync", {
          source: "db:create-messages",
          clientConversationId,
          upsertedMessages
        } satisfies MessageSyncPayload);
      }
      return true;
    } catch (err) {
      log.error("Failed to insert messages:", err);
      return false;
    }
  });

  ipcMain.handle("db:add-message", (event, message) => {
    log.debug("Adding message cmid=" + message?.client_message_id);
    const db = getDb();
    const stmt = db.prepare(
      `
      INSERT OR IGNORE INTO local_messages (
        client_message_id,
        server_message_id, 
        client_conversation_id,
        sequence,
        sender_id, 
        sender_nickname,
        sender_avatar,
        content, 
        type,
        created_at,  
        updated_at,
        status,
        is_recalled,
        is_favorited,
        is_pinned,
        reply_to_message_id,
        reply_to_sender_id,
        reply_to_sender_nickname,
        reply_to_text
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    );
    const result = stmt.run(
      message.client_message_id,
      message.server_message_id,
      message.client_conversation_id,
      message.sequence,
      message.sender_id,
      message.sender_nickname ?? null,
      message.sender_avatar ?? null,
      JSON.stringify(message.content),
      message.type,
      message.created_at,
      message.updated_at ?? message.created_at,
      message.status,
      message.is_recalled,
      message.is_favorited ?? 0,
      message.is_pinned ?? 0,
      message.reply_to_message_id || null,
      message.reply_to?.sender_id || null,
      message.reply_to?.sender_nickname || null,
      message.reply_to?.text || null
    );
    if (result.changes > 0) {
      if (
        !shouldStoreConversationMessage(
          db,
          String(message.client_conversation_id || ""),
          Number(message.sequence || 0)
        )
      ) {
        db.prepare(
          `
          DELETE FROM local_messages
          WHERE client_message_id = ?
        `
        ).run(message.client_message_id);
        return false;
      }
      const currentUserId = store.get("last-login-user") as number | null;
      const isMentioned =
        currentUserId !== null &&
        message.sender_id !== currentUserId &&
        isMentioningUser(message.content, currentUserId);
      db.prepare(
        `
        UPDATE local_conversations
        SET last_message_send_id = ?,
            last_message_content = ?,
            last_message_time = ?,
            is_archived = 0,
            is_locally_deleted = CASE
              WHEN COALESCE(?, 0) > COALESCE(local_hidden_before_seq, 0) THEN 0
              ELSE is_locally_deleted
            END,
            draft = CASE
              WHEN ? IS NOT NULL AND ? = ? THEN NULL
              ELSE draft
            END,
            last_server_sequence = CASE
              WHEN COALESCE(?, 0) > COALESCE(last_server_sequence, COALESCE(last_sync_sequence, 0)) THEN ?
              ELSE COALESCE(last_server_sequence, COALESCE(last_sync_sequence, 0))
            END,
            unread_count = CASE
              WHEN ? IS NOT NULL AND ? != ? THEN COALESCE(unread_count, 0) + 1
              ELSE unread_count
            END,
            mention_unread_count = CASE
              WHEN ? THEN COALESCE(mention_unread_count, 0) + 1
              ELSE mention_unread_count
            END,
            updated_at = CURRENT_TIMESTAMP
        WHERE client_conversation_id = ?
      `
      ).run(
        message.sender_id,
        JSON.stringify(message.content),
        message.created_at,
        message.sequence ?? 0,
        currentUserId,
        message.sender_id,
        currentUserId,
        message.sequence ?? 0,
        message.sequence ?? 0,
        currentUserId,
        message.sender_id,
        currentUserId,
        isMentioned ? 1 : 0,
        message.client_conversation_id
      );
      if (Number(message.sequence || 0) > 0) {
        reconcileConversationSyncProgress(
          db,
          message.client_conversation_id,
          Number(message.sequence || 0)
        );
      }
      event.sender.send("conversation-sync", {
        source: "db:add-message",
        affectedClientConversationIds: [String(message.client_conversation_id)]
      } satisfies ConversationSyncPayload);
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
        .get(message.client_message_id) as Record<string, unknown> | undefined;
      if (fullMsg && !fullMsg.sender_nickname && message.sender_nickname) {
        fullMsg.sender_nickname = message.sender_nickname;
      }
      if (fullMsg && !fullMsg.sender_avatar && message.sender_avatar) {
        fullMsg.sender_avatar = message.sender_avatar;
      }
      event.sender.send(
        "db:message-added",
        normalizeMessageRow(attachReactionsToRow(fullMsg))
      );
      return true;
    }
    return false;
  });

  ipcMain.handle("db:update-message-status", (event, msg) => {
    log.debug("Updating message status cmid=" + msg?.client_message_id);
    const db = getDb();
    // 可选：当上层（如附件上传成功后的内容补齐 / 上传失败的 upload_error 写入）
    // 一并提供 content 时，同步覆写 local_messages.content。
    const hasContent =
      msg.content !== undefined &&
      msg.content !== null &&
      (typeof msg.content === "object" || typeof msg.content === "string");
    const stmt = db.prepare(
      hasContent
        ? "UPDATE local_messages SET status = ?, server_message_id = ?, sequence = ?, content = ?, updated_at = COALESCE(?, updated_at) WHERE client_message_id = ?"
        : "UPDATE local_messages SET status = ?, server_message_id = ?, sequence = ?, updated_at = COALESCE(?, updated_at) WHERE client_message_id = ?"
    );
    const result = hasContent
      ? stmt.run(
          msg.status,
          msg.server_message_id,
          msg.sequence,
          typeof msg.content === "string"
            ? msg.content
            : JSON.stringify(msg.content),
          msg.updated_at ?? null,
          msg.client_message_id
        )
      : stmt.run(
          msg.status,
          msg.server_message_id,
          msg.sequence,
          msg.updated_at ?? null,
          msg.client_message_id
        );
    if (result.changes > 0) {
      if (Number(msg.sequence || 0) > 0) {
        reconcileConversationSyncProgress(
          db,
          msg.client_conversation_id,
          Number(msg.sequence || 0)
        );
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
        .get(msg.client_message_id);

      log.debug("Message status updated cmid=" + msg?.client_message_id);
      event.sender.send(
        "db:message-updated",
        normalizeMessageRow(attachReactionsToRow(fullMsg as any))
      );
      return true;
    }
    return false;
  });

  ipcMain.handle("db:update-message-state", (event, payload) => {
    const db = getDb();
    const result = db
      .prepare(
        `
        UPDATE local_messages
        SET
          is_favorited = COALESCE(@is_favorited, is_favorited),
          is_pinned = COALESCE(@is_pinned, is_pinned),
          updated_at = CURRENT_TIMESTAMP
        WHERE client_message_id = @clientMessageId
        `
      )
      .run({
        clientMessageId: payload.clientMessageId,
        is_favorited:
          payload.is_favorited === undefined ? null : payload.is_favorited,
        is_pinned: payload.is_pinned === undefined ? null : payload.is_pinned
      });

    if (result.changes <= 0) {
      return false;
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
      .get(payload.clientMessageId);

    if (!fullMsg) {
      return false;
    }

    event.sender.send(
      "db:message-updated",
      normalizeMessageRow(attachReactionsToRow(fullMsg))
    );
    return true;
  });

  ipcMain.handle("db:apply-message-states", (event, states) => {
    const items = Array.isArray(states) ? states : [];
    if (items.length === 0) {
      return false;
    }

    const db = getDb();
    const updateState = db.prepare(
      `
      UPDATE local_messages
      SET
        is_favorited = @is_favorited,
        is_pinned = @is_pinned,
        updated_at = COALESCE(@updated_at, updated_at)
      WHERE server_message_id = @message_id
      `
    );
    const notifyByConversation = new Set<string>();
    const serverMessageIds = new Set<string>();

    const applyStates = db.transaction(() => {
      for (const item of items) {
        updateState.run({
          message_id: item.message_id,
          is_favorited: item.is_favorited ?? 0,
          is_pinned: item.is_pinned ?? 0,
          updated_at: item.updated_at ?? null
        });
        if (item.conversation_id) {
          notifyByConversation.add(String(item.conversation_id));
        }
        if (item.message_id) {
          serverMessageIds.add(String(item.message_id));
        }
      }
    });

    applyStates();
    const affectedConversationIds = Array.from(notifyByConversation);

    if (affectedConversationIds.length === 1) {
      // Single-conversation case: re-select the affected rows and emit a
      // proper diff payload so the renderer can patch is_favorited /
      // is_pinned in place. Without this the renderer's `onMessageSync`
      // handler has no `clientConversationId` to patch and the in-memory
      // message list keeps a stale flag until the conversation is
      // reopened.
      const clientConversationId = affectedConversationIds[0];
      const idList = Array.from(serverMessageIds);
      const clientMessageIds: string[] = [];
      for (let i = 0; i < idList.length; i += SELECT_BY_CLIENT_ID_CHUNK) {
        const chunk = idList.slice(i, i + SELECT_BY_CLIENT_ID_CHUNK);
        const placeholders = chunk.map(() => "?").join(",");
        const rows = db
          .prepare(
            `
            SELECT client_message_id
            FROM local_messages
            WHERE server_message_id IN (${placeholders})
            `
          )
          .all(...chunk) as Array<{ client_message_id: string }>;
        for (const row of rows) {
          if (row?.client_message_id) {
            clientMessageIds.push(String(row.client_message_id));
          }
        }
      }
      const fullRows = selectMessagesByClientIds(clientMessageIds);
      const upsertedMessages = normalizeMessageRows(fullRows);
      event.sender.send("message-sync", {
        source: "db:apply-message-states",
        clientConversationId,
        upsertedMessages,
        affectsMultipleConversations: false
      } satisfies MessageSyncPayload);
    } else {
      // Multi-conversation (or zero) case: rendering each per-row patch
      // would require N additional metadata refetches. Keep the legacy
      // "bulk" hint so the renderer falls back to a single
      // `fetchConversations()` and trusts the conversation-sync emit
      // below for metadata changes.
      event.sender.send("message-sync", {
        source: "db:apply-message-states",
        affectsMultipleConversations: affectedConversationIds.length > 1
      } satisfies MessageSyncPayload);
    }

    if (affectedConversationIds.length > 0) {
      event.sender.send("conversation-sync", {
        source: "db:apply-message-states",
        affectedClientConversationIds: affectedConversationIds
      } satisfies ConversationSyncPayload);
    }
    return true;
  });

  ipcMain.handle("db:apply-message-recall", (event, payload) => {
    const db = getDb();
    const result = db
      .prepare(
        `
        UPDATE local_messages
        SET
          is_recalled = 1,
          content = ?,
          status = 0
        WHERE server_message_id = ?
        `
      )
      .run(JSON.stringify(payload.content), payload.serverMessageId);

    if (result.changes <= 0) {
      return false;
    }

    const recalledMessage = db
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
        WHERE m.server_message_id = ?
        `
      )
      .get(payload.serverMessageId);

    if (!recalledMessage) {
      return false;
    }

    db.prepare(
      `
      UPDATE local_conversations
      SET
        last_message_content = CASE
          WHEN server_conversation_id = ? AND last_sync_sequence <= ?
          THEN ?
          ELSE last_message_content
        END,
        updated_at = COALESCE(?, CURRENT_TIMESTAMP)
      WHERE server_conversation_id = ?
      `
    ).run(
      payload.serverConversationId,
      payload.sequence,
      JSON.stringify(payload.content),
      payload.updatedAt ?? null,
      payload.serverConversationId
    );

    event.sender.send(
      "db:message-updated",
      normalizeMessageRow(attachReactionsToRow(recalledMessage))
    );
    return true;
  });

  // 删除一条"失败的本地附件草稿"行（仅 local_messages）。
  // outbox 中的 source / preview 由调用方（renderer）单独走 outbox:delete 清理。
  // outgoing 队列由调用方走 db:delete-outgoing-message 清理。
  // 这里只负责 DB 行删除 + 通知 renderer 把该 cmid 从内存列表中拿掉。
  //
  // 严格守卫：仅当 server_message_id 为空（即未上链）时才删，避免误删服务端
  // 已确认的消息。
  ipcMain.handle("db:delete-local-message", (event, payload) => {
    const clientMessageId = String(payload?.clientMessageId ?? "");
    const clientConversationId = String(payload?.clientConversationId ?? "");
    if (!clientMessageId || !clientConversationId) {
      return false;
    }
    const db = getDb();
    const result = db
      .prepare(
        `DELETE FROM local_messages
         WHERE client_message_id = ?
           AND (server_message_id IS NULL OR server_message_id = '')`
      )
      .run(clientMessageId);
    if (result.changes <= 0) {
      log.warn("db:delete-local-message: row absent or already on-chain", {
        clientMessageId
      });
      return false;
    }
    event.sender.send("message-sync", {
      source: "db:delete-local-message",
      clientConversationId,
      removedClientMessageIds: [clientMessageId]
    } satisfies MessageSyncPayload);
    return true;
  });

  ipcMain.handle("db:update-message-attachment", (event, payload) => {
    const uploadId = String(payload?.upload_id ?? "");
    if (!uploadId) {
      return false;
    }
    const db = getDb();
    const row = db
      .prepare(
        `
        SELECT m.client_message_id, m.content
        FROM local_messages m
        WHERE json_extract(m.content, '$.upload_id') = ?
        LIMIT 1
        `
      )
      .get(uploadId) as
      | { client_message_id: string; content: string }
      | undefined;
    if (!row) {
      return false;
    }
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(row.content || "{}");
    } catch {
      return false;
    }
    const next = { ...parsed } as Record<string, unknown>;
    if (typeof payload.url === "string") {
      next.url = payload.url;
    }
    if (typeof payload.thumb_url === "string") {
      next.thumb_url = payload.thumb_url;
    }
    if (typeof payload.preview_url === "string") {
      next.preview_url = payload.preview_url;
    }
    if (typeof payload.width === "number") {
      next.width = payload.width;
    }
    if (typeof payload.height === "number") {
      next.height = payload.height;
    }
    if (typeof payload.thumb_status === "string") {
      next.thumb_status = payload.thumb_status;
    }
    db.prepare(
      `UPDATE local_messages SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE client_message_id = ?`
    ).run(JSON.stringify(next), row.client_message_id);

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
      .get(row.client_message_id);
    if (!fullMsg) {
      return false;
    }
    event.sender.send(
      "db:message-updated",
      normalizeMessageRow(attachReactionsToRow(fullMsg as any))
    );
    return true;
  });
}
