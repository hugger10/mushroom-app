import type { Message } from "@mushroom/shared";
import type { MobileDataRepository } from "@mushroom/app-core";
import { limitTimelineMessages } from "./helpers";
import type { RepoDeps } from "./types";

/**
 * Snapshot 子模块：组装 `publishSnapshot` 的全量快照。
 *
 * 与原文件保持一致的关键语义：
 *   - 仅对 `activeClientConversationId` 加载最近消息，其它会话给空数组，避免
 *     对所有会话做 N×全量扫描（mobile UI 仅消费激活会话的 key）。
 *   - 优先走 `listRecentMessages`（sequence DESC 索引早停的轻量路径），
 *     仅在未传 limit 时退回 `listMessages` 全量扫描兜底。
 *
 * 跨域调用通过对组装后的 repo 引用（`repoRef`）实现，等价于原文件中的
 * `this.xxx`；snapshot 工厂必须**在其它子工厂全部 Object.assign 之后**调用，
 * 保证 `repoRef.listRecentMessages` / `repoRef.listMessages` 在方法体执行时
 * 已绑定。
 */
export function createSnapshotRepo(
  deps: RepoDeps,
  repoRef: MobileDataRepository
): Pick<MobileDataRepository, "snapshot"> {
  const { ensureInitialized, groupReadStateByConversation } = deps;

  return {
    async snapshot(options) {
      await ensureInitialized();
      const contacts = await repoRef.listContacts();
      const conversations = await repoRef.listConversations();
      const messagesByConversation: Record<string, Message[]> = {};

      // 仅对当前激活会话加载最近消息，避免在 publishSnapshot 高频路径上
      // 对所有会话（动辄数十个）逐个做全量扫描。非激活会话的 messages 数组
      // 在 mobile UI 中没有任何消费方（仅 useMobileAppState 用激活会话的
      // key），因此给空数组是安全的。
      //
      // activeClientConversationId 为 null 时（例如用户停在会话列表页时
      // 的 syncNow），所有会话的 messages 全部置空。
      const activeId = options?.activeClientConversationId ?? null;
      const defaultLimit = options?.defaultMessageLimit;

      for (const conversation of conversations) {
        const conversationId = conversation.client_conversation_id;
        if (!activeId || conversationId !== activeId) {
          messagesByConversation[conversationId] = [];
          continue;
        }
        const perConversationLimit =
          options?.messageLimitByConversation?.[conversationId] ?? defaultLimit;
        if (perConversationLimit && perConversationLimit > 0) {
          // 走 sequence DESC 索引早停的轻量路径，单条 SQL 命中索引前 N 条。
          messagesByConversation[conversationId] =
            await repoRef.listRecentMessages!(conversationId, {
              limit: perConversationLimit
            });
        } else {
          // 兜底：未传 limit 时退回到旧的全量加载语义。
          messagesByConversation[conversationId] = limitTimelineMessages(
            await repoRef.listMessages(conversationId),
            perConversationLimit
          );
        }
      }

      return {
        contacts,
        conversations,
        messagesByConversation,
        groupReadStateByConversation
      };
    }
  };
}
