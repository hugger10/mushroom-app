import type { Message } from "@mushroom/shared";
import type { MobileDataRepository } from "@mushroom/app-core";
import {
  applyMessageState,
  cloneMessage,
  getConversationHiddenFloor,
  isMessageVisibleForConversation,
  recomputeConversationProgress,
  safeJsonParse
} from "./helpers";
import {
  loadConversationByClientId,
  loadMessagesForConversation,
  loadRecentMessagesForConversation,
  queryRows,
  serializeMessageForPersistence,
  upsertConversationRecord,
  type SQLiteRow
} from "./queries";
import type { RepoDeps } from "./types";

/**
 * Messages 子模块：mobile_messages / mobile_message_states 的读 / 写主路径。
 *
 * 写串行化语义（保持与原文件一致）：
 *   - `upsertMessages` 与 `applyMessageStates` 包 `runExclusive`，与
 *     `removeConversations` / `clearConversationMessages` /
 *     `softDeleteConversation` / `clear` 形成同一条写串行化链；防止 WS 实时分发
 *     与 pull-sync 同时落同一 `server_message_id` 撞上 `idx_mobile_messages_server`。
 *   - 读路径 `listMessages` / `listRecentMessages` 不加锁。
 */
export function createMessageRepo(
  deps: RepoDeps
): Pick<
  MobileDataRepository,
  | "listMessages"
  | "listRecentMessages"
  | "upsertMessages"
  | "applyMessageStates"
  | "deleteLocalMessages"
> {
  const { db, ensureInitialized, runExclusive } = deps;

  return {
    async listMessages(clientConversationId) {
      await ensureInitialized();
      const conversation = await loadConversationByClientId(
        db,
        clientConversationId
      );
      const hiddenFloor = conversation
        ? getConversationHiddenFloor(conversation)
        : 0;
      const messages = await loadMessagesForConversation(
        db,
        clientConversationId
      );
      return messages
        .filter(item => isMessageVisibleForConversation(item, hiddenFloor))
        .map(cloneMessage);
    },
    async listRecentMessages(clientConversationId, options) {
      await ensureInitialized();
      const limit = Math.max(1, Math.floor(options?.limit ?? 0) || 1);
      const messages = await loadRecentMessagesForConversation(
        db,
        clientConversationId,
        limit
      );
      // loadRecentMessagesForConversation 已经在 SQL 层用 sequence > hiddenFloor
      // 过滤，这里仅做 cloneMessage 保护边界。
      return messages.map(cloneMessage);
    },
    async upsertMessages(messages) {
      await ensureInitialized();
      return runExclusive(async () => {
        const affectedConversationIds = new Set<string>();

        for (const message of messages) {
          if (!message.client_conversation_id) {
            continue;
          }

          const hiddenConversation = await loadConversationByClientId(
            db,
            message.client_conversation_id
          );
          const hiddenFloor = hiddenConversation
            ? getConversationHiddenFloor(hiddenConversation)
            : 0;
          if (!isMessageVisibleForConversation(message, hiddenFloor)) {
            continue;
          }

          const existingRows = await queryRows<SQLiteRow>(
            db,
            `SELECT client_message_id, payload
           FROM mobile_messages
           WHERE client_message_id = ?
              OR (server_message_id IS NOT NULL AND server_message_id <> '' AND server_message_id = ?)
           LIMIT 1`,
            [message.client_message_id, message.server_message_id || ""]
          );
          const existing = existingRows[0]?.payload
            ? safeJsonParse<Message>(existingRows[0].payload, null as never)
            : null;
          const nextMessage = existing ? { ...existing, ...message } : message;
          const persistedClientMessageId = String(
            existingRows[0]?.client_message_id || nextMessage.client_message_id
          );
          const persistedMessage = {
            ...nextMessage,
            client_message_id: persistedClientMessageId
          };

          await db.executeAsync(
            `INSERT INTO mobile_messages (
             client_message_id,
             server_message_id,
             client_conversation_id,
             sequence,
             created_at,
             payload
           ) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(client_message_id) DO UPDATE SET
             server_message_id = excluded.server_message_id,
             client_conversation_id = excluded.client_conversation_id,
             sequence = excluded.sequence,
             created_at = excluded.created_at,
             payload = excluded.payload
           ON CONFLICT(server_message_id)
             WHERE server_message_id IS NOT NULL AND server_message_id <> ''
             DO UPDATE SET
               client_conversation_id = excluded.client_conversation_id,
               sequence = excluded.sequence,
               created_at = excluded.created_at,
               payload = excluded.payload`,
            [
              persistedMessage.client_message_id,
              persistedMessage.server_message_id || null,
              persistedMessage.client_conversation_id,
              Number(persistedMessage.sequence || 0),
              persistedMessage.created_at || "",
              await serializeMessageForPersistence(db, persistedMessage)
            ]
          );
          affectedConversationIds.add(persistedMessage.client_conversation_id);
        }

        for (const conversationId of affectedConversationIds) {
          const conversation = await loadConversationByClientId(
            db,
            conversationId
          );
          if (!conversation) {
            continue;
          }

          const nextMessages = await loadMessagesForConversation(
            db,
            conversationId
          );
          await upsertConversationRecord(
            db,
            recomputeConversationProgress(conversation, nextMessages)
          );
        }
      });
    },
    async applyMessageStates(states) {
      await ensureInitialized();
      return runExclusive(async () => {
        for (const state of states) {
          await db.executeAsync(
            `INSERT INTO mobile_message_states (
             message_id,
             conversation_id,
             is_favorited,
             is_pinned,
             updated_at,
             payload
           ) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(message_id) DO UPDATE SET
             conversation_id = excluded.conversation_id,
             is_favorited = excluded.is_favorited,
             is_pinned = excluded.is_pinned,
             updated_at = excluded.updated_at,
             payload = excluded.payload`,
            [
              state.message_id,
              state.conversation_id,
              Number(state.is_favorited || 0),
              Number(state.is_pinned || 0),
              state.updated_at,
              JSON.stringify(state)
            ]
          );

          const rows = await queryRows<SQLiteRow>(
            db,
            `SELECT client_message_id, payload
           FROM mobile_messages
           WHERE server_message_id = ?
           LIMIT 1`,
            [state.message_id]
          );
          if (rows[0]?.payload) {
            const message = safeJsonParse<Message>(
              rows[0].payload,
              null as never
            );
            if (message) {
              const nextMessage = applyMessageState(message, state);
              await db.executeAsync(
                `UPDATE mobile_messages
               SET payload = ?
               WHERE client_message_id = ?`,
                [JSON.stringify(nextMessage), rows[0].client_message_id]
              );
            }
          }
        }
      });
    },
    /**
     * 删除若干条本地消息行（仅按 client_message_id 匹配）。
     *
     * 调用方（MessageSendService.deleteFailedLocalAttachmentMessage）已经做过
     * `status===-1 && !server_message_id && type===2` 守卫，这里只是物理删除
     * SQLite 行，不再校验。但仍保留一道"仅删 server_message_id 为空"的 SQL
     * 守卫，避免任何调用方误传上链消息的 cid。
     *
     * 同时刷新会话 progress（已读 / 未读 / 最近消息），与 upsertMessages
     * 结尾的逻辑一致。
     */
    async deleteLocalMessages(clientConversationId, clientMessageIds) {
      await ensureInitialized();
      if (!clientConversationId || clientMessageIds.length === 0) {
        return;
      }
      return runExclusive(async () => {
        for (const cid of clientMessageIds) {
          await db.executeAsync(
            `DELETE FROM mobile_messages
             WHERE client_message_id = ?
               AND client_conversation_id = ?
               AND (server_message_id IS NULL OR server_message_id = '')`,
            [String(cid), String(clientConversationId)]
          );
        }
        const conversation = await loadConversationByClientId(
          db,
          clientConversationId
        );
        if (!conversation) {
          return;
        }
        const nextMessages = await loadMessagesForConversation(
          db,
          clientConversationId
        );
        await upsertConversationRecord(
          db,
          recomputeConversationProgress(conversation, nextMessages)
        );
      });
    }
  };
}
