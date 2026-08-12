import type { MobileDataRepository } from "@mushroom/app-core";
import type { RepoDeps } from "./types";

/**
 * Group-read 子模块：SQLite 持久化 + 内存热缓存的群已读高水位。
 *
 * 复用 `RepoDeps.groupReadStateByConversation` 这一共享对象引用，确保
 * snapshot 子模块读到的就是此处写入的同一份。SQLite 表仅作为本地缓存，
 * 服务端 `GET /api/conversation/:id/read-state` 和 WS `group_read` 仍是权威
 * 校准来源；写入永远取 max，避免高水位回退。
 */
export function createGroupReadRepo(
  deps: RepoDeps
): Pick<
  MobileDataRepository,
  "upsertGroupReadStates" | "clearGroupReadState" | "clearAllGroupReadStates"
> {
  const { db, ensureInitialized, groupReadStateByConversation } = deps;

  return {
    async upsertGroupReadStates(serverConversationId, entries) {
      await ensureInitialized();
      if (!serverConversationId || entries.length === 0) return;
      const bucket = groupReadStateByConversation[serverConversationId]
        ? { ...groupReadStateByConversation[serverConversationId] }
        : {};
      let changed = false;
      for (const entry of entries) {
        const readerId = Number(entry.user_id);
        const incoming = Number(entry.last_read_seq || 0);
        if (!Number.isFinite(readerId) || readerId <= 0 || incoming <= 0) {
          continue;
        }
        const previous = bucket[readerId] ?? 0;
        if (incoming > previous) {
          await db.executeAsync(
            `INSERT INTO mobile_group_read_states (
               server_conversation_id,
               reader_user_id,
               last_read_seq,
               updated_at
             ) VALUES (?, ?, ?, datetime('now'))
             ON CONFLICT(server_conversation_id, reader_user_id) DO UPDATE SET
               last_read_seq = CASE
                 WHEN excluded.last_read_seq > mobile_group_read_states.last_read_seq
                 THEN excluded.last_read_seq
                 ELSE mobile_group_read_states.last_read_seq
               END,
               updated_at = CASE
                 WHEN excluded.last_read_seq > mobile_group_read_states.last_read_seq
                 THEN excluded.updated_at
                 ELSE mobile_group_read_states.updated_at
               END`,
            [serverConversationId, readerId, incoming]
          );
          bucket[readerId] = incoming;
          changed = true;
        }
      }
      if (!changed) return;
      groupReadStateByConversation[serverConversationId] = bucket;
    },
    async clearGroupReadState(serverConversationId) {
      await ensureInitialized();
      if (!serverConversationId) return;
      delete groupReadStateByConversation[serverConversationId];
      await db.executeAsync(
        `DELETE FROM mobile_group_read_states WHERE server_conversation_id = ?`,
        [serverConversationId]
      );
    },
    async clearAllGroupReadStates() {
      await ensureInitialized();
      // 用户切到"关闭已读回执"时一次性清空所有群已读高水位缓存，
      // 避免重新打开时历史 ✓✓ 立刻冒出（"幽灵已读"）。
      for (const key of Object.keys(groupReadStateByConversation)) {
        delete groupReadStateByConversation[key];
      }
      await db.executeAsync(`DELETE FROM mobile_group_read_states`);
    }
  };
}
