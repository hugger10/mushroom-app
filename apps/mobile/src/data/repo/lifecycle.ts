import type { MobileDataRepository } from "@mushroom/app-core";
import { buildConversationBlankPatch } from "@mushroom/app-core";
import { calculateConversationCutoff } from "./helpers";
import {
  loadConversationByClientId,
  loadMessagesForConversation,
  upsertConversationRecord
} from "./queries";
import type { RepoDeps } from "./types";

/**
 * Lifecycle 子模块：处理"清空 / 软删除会话 / 标记历史完整 / 全量 clear"四个
 * 会跨表写的操作。
 *
 * 写串行化语义（保持原文件一致）：
 *   - `clearConversationMessages`、`softDeleteConversation`、`clear` 包
 *     `runExclusive`，与 messages / removeConversations 同一条写链。
 *   - `markHistoryComplete` **不**包 runExclusive（原文件如此）：它只 UPDATE
 *     `mobile_conversations` 的若干汇总字段，不动 `mobile_messages`。
 */
export function createLifecycleRepo(
  deps: RepoDeps
): Pick<
  MobileDataRepository,
  | "clearConversationMessages"
  | "softDeleteConversation"
  | "markHistoryComplete"
  | "clear"
> {
  const { db, ensureInitialized, runExclusive } = deps;

  return {
    async clearConversationMessages(clientConversationId) {
      await ensureInitialized();
      return runExclusive(async () => {
        const conversation = await loadConversationByClientId(
          db,
          clientConversationId
        );
        const existingMessages = await loadMessagesForConversation(
          db,
          clientConversationId
        );
        await db.executeAsync(
          `DELETE FROM mobile_messages WHERE client_conversation_id = ?`,
          [clientConversationId]
        );

        if (conversation) {
          const cutoff = calculateConversationCutoff(
            conversation,
            existingMessages
          );
          await upsertConversationRecord(db, {
            ...conversation,
            ...buildConversationBlankPatch(cutoff, {
              markLocallyDeleted: false
            })
          });
        }
      });
    },
    async softDeleteConversation(clientConversationId) {
      await ensureInitialized();
      return runExclusive(async () => {
        const conversation = await loadConversationByClientId(
          db,
          clientConversationId
        );
        const existingMessages = await loadMessagesForConversation(
          db,
          clientConversationId
        );
        await db.executeAsync(
          `DELETE FROM mobile_messages WHERE client_conversation_id = ?`,
          [clientConversationId]
        );

        if (conversation) {
          const cutoff = calculateConversationCutoff(
            conversation,
            existingMessages
          );
          if (conversation.server_conversation_id) {
            await db.executeAsync(
              `DELETE FROM mobile_group_read_states WHERE server_conversation_id = ?`,
              [conversation.server_conversation_id]
            );
            delete deps.groupReadStateByConversation[
              conversation.server_conversation_id
            ];
          }
          await upsertConversationRecord(db, {
            ...conversation,
            ...buildConversationBlankPatch(cutoff, { markLocallyDeleted: true })
          });
        }
      });
    },
    async markHistoryComplete(clientConversationId, oldestVisibleSequence) {
      await ensureInitialized();
      const conversation = await loadConversationByClientId(
        db,
        clientConversationId
      );
      if (!conversation) {
        return;
      }
      // 与 Electron `db:mark-history-complete` 同口径：仅收敛
      // history_complete / local_hidden_before_seq / tail_loaded_from_seq，
      // 其它字段交给下一轮 recomputeConversationSyncProgress 复算。
      const normalized = Math.max(0, Number(oldestVisibleSequence || 0));
      const existingHidden = Number(conversation.local_hidden_before_seq || 0);
      const candidateCutoff = normalized > 0 ? normalized - 1 : 0;
      const nextHidden = Math.max(existingHidden, candidateCutoff);

      const existingTailFrom = Number(conversation.tail_loaded_from_seq || 0);
      const nextTailFrom =
        normalized > 0
          ? existingTailFrom === 0
            ? normalized
            : Math.min(existingTailFrom, normalized)
          : existingTailFrom;

      await upsertConversationRecord(db, {
        ...conversation,
        history_complete: 1,
        local_hidden_before_seq: nextHidden,
        tail_loaded_from_seq: nextTailFrom
      });
    },
    async clear() {
      await ensureInitialized();
      return runExclusive(async () => {
        await db.executeAsync(`DELETE FROM mobile_reaction_cursors`);
        await db.executeAsync(`DELETE FROM mobile_message_reactions`);
        await db.executeAsync(`DELETE FROM mobile_message_states`);
        await db.executeAsync(`DELETE FROM mobile_messages`);
        await db.executeAsync(`DELETE FROM mobile_group_read_states`);
        await db.executeAsync(`DELETE FROM mobile_conversations`);
        await db.executeAsync(`DELETE FROM mobile_contacts`);
        for (const key of Object.keys(deps.groupReadStateByConversation)) {
          delete deps.groupReadStateByConversation[key];
        }
      });
    }
  };
}
