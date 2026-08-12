import type { Conversation } from "@mushroom/shared";
import type { MobileDataRepository } from "@mushroom/app-core";
import { cloneConversation, safeJsonParse, sortConversations } from "./helpers";
import {
  loadConversationByClientId,
  queryRows,
  upsertConversationRecord,
  type SQLiteRow
} from "./queries";
import type { RepoDeps } from "./types";

/**
 * Conversations 子模块：仅触达 `mobile_conversations` 表（含与 messages /
 * reactions 表的级联删除）。
 *
 * 写串行化语义保持原文件：
 *   - `upsertConversations`、`getConversationBy*`：不包 runExclusive。
 *   - `removeConversations`：包 runExclusive，因为它会级联删除 mobile_messages /
 *     mobile_message_reactions，与 upsertMessages 的"读后写"链路竞争。
 */
export function createConversationRepo(
  deps: RepoDeps
): Pick<
  MobileDataRepository,
  | "listConversations"
  | "getConversationByClientId"
  | "upsertConversations"
  | "removeConversations"
  | "getConversationByServerId"
> {
  const { db, ensureInitialized, runExclusive } = deps;

  return {
    async listConversations() {
      await ensureInitialized();
      const rows = await queryRows<SQLiteRow>(
        db,
        `SELECT payload
         FROM mobile_conversations
         ORDER BY is_archived ASC, is_pinned DESC, last_message_time DESC`
      );
      const conversations = rows
        .map(row => safeJsonParse<Conversation>(row.payload, null as never))
        .filter((item): item is Conversation => item !== null)
        .map(cloneConversation);
      return sortConversations(conversations);
    },
    async getConversationByClientId(clientConversationId) {
      await ensureInitialized();
      const conversation = await loadConversationByClientId(
        db,
        clientConversationId
      );
      return conversation ? cloneConversation(conversation) : null;
    },
    async upsertConversations(conversations) {
      await ensureInitialized();
      for (const conversation of conversations) {
        const existing = await loadConversationByClientId(
          db,
          conversation.client_conversation_id
        );
        await upsertConversationRecord(db, {
          ...existing,
          ...conversation,
          members: conversation.members?.map(member => ({ ...member }))
        });
      }
    },
    async removeConversations(clientConversationIds) {
      await ensureInitialized();
      return runExclusive(async () => {
        for (const clientConversationId of clientConversationIds) {
          const conversation = await loadConversationByClientId(
            db,
            clientConversationId
          );
          const serverConversationId =
            conversation?.server_conversation_id ?? null;
          await db.executeAsync(
            `DELETE FROM mobile_conversations WHERE client_conversation_id = ?`,
            [clientConversationId]
          );
          await db.executeAsync(
            `DELETE FROM mobile_messages WHERE client_conversation_id = ?`,
            [clientConversationId]
          );
          if (serverConversationId) {
            await db.executeAsync(
              `DELETE FROM mobile_message_reactions WHERE conversation_id = ?`,
              [serverConversationId]
            );
            await db.executeAsync(
              `DELETE FROM mobile_group_read_states WHERE server_conversation_id = ?`,
              [serverConversationId]
            );
            delete deps.groupReadStateByConversation[serverConversationId];
          }
        }
      });
    },
    async getConversationByServerId(serverConversationId) {
      await ensureInitialized();
      const rows = await queryRows<SQLiteRow>(
        db,
        `SELECT payload
         FROM mobile_conversations
         WHERE server_conversation_id = ?
         LIMIT 1`,
        [serverConversationId]
      );
      const conversation = rows[0]?.payload
        ? safeJsonParse<Conversation>(rows[0].payload, null as never)
        : null;
      return conversation ? cloneConversation(conversation) : null;
    }
  };
}
