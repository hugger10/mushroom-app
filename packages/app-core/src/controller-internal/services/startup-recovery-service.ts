import type {
  ChatMessage,
  Message,
  MessageFileContent
} from "@mushroom/shared";
import type { ControllerContext } from "../context";

/**
 * StartupRecoveryService — App 启动时一次性修复"上次会话遗留的本地消息状态"。
 *
 * 核心场景：用户上次发送图片/视频/语音/文件时崩溃 / 强杀 / 系统挂起，
 * 重启后我们必须保证：
 *
 *   1. 假"发送中"归位为"等待网络/失败"，避免无尽 spinner 误导用户。
 *   2. 仓库中已持久化的 `local_source_ref` / `local_preview_ref` 重新映射为
 *      运行时可渲染的 `local_preview_uri`，让缩略图气泡始终可见 —— 这是
 *      消除"裸叉叉"的关键。
 *   3. 引用失效（IndexedDB 项被淘汰 / file:// 被系统清理）时置
 *      `local_source_missing=true`，UI 据此渲染"图片已不存在 / 重新选择文件"。
 *   4. 孤儿清理：删除存储中不再被任何消息引用的条目，防止累积。
 *
 * 与"发送队列恢复"分离：本服务只重建 UI 可见性。真正的自动重发由
 * `OutgoingRetryService.listRetryableOutgoingMessages` 在网络恢复 /
 * AppState 变更时触发。
 */
export class StartupRecoveryService {
  private readonly ctx: ControllerContext;
  constructor(ctx: ControllerContext) {
    this.ctx = ctx;
  }

  /**
   * 启动时一次性调用。所有平台（web / electron 渲染进程 / mobile）都应在
   * 完成 store 注入并能确认当前 uid 后调用一次。重复调用是安全的（幂等）。
   */
  async recover(): Promise<void> {
    const repo = this.ctx.getRepository();
    const auth = await this.ctx.getAuthStore().read();
    const currentUserId = Number(auth.user?.userId || 0);
    if (!currentUserId) return;

    const conversations = await repo.listConversations();
    const activeRefs = new Set<string>();
    const patches: ChatMessage[] = [];

    for (const conversation of conversations) {
      const messages = await repo.listMessages(
        conversation.client_conversation_id
      );

      for (const message of messages) {
        if (
          Number(message.sender_id) !== currentUserId ||
          !message.client_message_id ||
          message.type !== 2
        ) {
          continue;
        }
        const content = this.readFileContent(message);
        if (!content) continue;

        // 1. 收集仍被引用的 refs，供孤儿清理。
        if (content.local_source_ref) activeRefs.add(content.local_source_ref);
        if (content.local_preview_ref)
          activeRefs.add(content.local_preview_ref);

        // 仅处理"发送中 / 失败"状态。已 ACK 的不必触碰。
        if (message.status !== 1 && message.status !== -1) continue;

        const nextContent = { ...content } as MessageFileContent;
        let mutated = false;
        let nextStatus = message.status;
        let nextLastError = message.last_error ?? null;

        // 2. 重建运行时预览 URL（仅对 mobile file:// 有效；web/electron
        //    渲染进程需要异步走 attachmentStore.get → URL.createObjectURL，
        //    该工作由各端在 UI 层完成，不阻塞启动）。
        //    本服务只处理"ref 失效"的标记。
        const refsToCheck = [
          content.local_source_ref,
          content.local_preview_ref
        ].filter((ref): ref is string => Boolean(ref));
        if (refsToCheck.length > 0) {
          let anyMissing = false;
          for (const ref of refsToCheck) {
            const handle = await this.ctx.attachmentStore.get(ref);
            if (!handle) {
              anyMissing = true;
              break;
            }
          }
          if (anyMissing && !content.local_source_missing) {
            nextContent.local_source_missing = true;
            mutated = true;
          }
        }

        // 3. status:1 归位 → -1（等待网络）。上次崩溃在上传途中。
        if (message.status === 1) {
          nextStatus = -1;
          if (!nextLastError) {
            // 不写明确错误，让 UI 走"等待网络"分支（在线时显示重试）。
            nextLastError = "";
          }
          // 清理 upload_pending / upload_progress / upload_error，避免 UI
          // 仍以为在传输（或残留旧错误提示）。
          if (nextContent.upload_pending) {
            nextContent.upload_pending = false;
            mutated = true;
          }
          if (typeof nextContent.upload_progress === "number") {
            delete nextContent.upload_progress;
            mutated = true;
          }
          if (nextContent.upload_error !== undefined) {
            delete nextContent.upload_error;
            mutated = true;
          }
          mutated = true;
        }

        if (!mutated && nextStatus === message.status) continue;

        patches.push({
          ...(message as ChatMessage),
          status: nextStatus,
          last_error: nextLastError,
          content: nextContent as unknown as ChatMessage["content"]
        });
      }
    }

    if (patches.length > 0) {
      await repo.upsertMessages(patches);
    }

    // 4. 孤儿清理（best-effort，失败不影响启动）。
    try {
      await this.ctx.attachmentStore.sweep(activeRefs);
    } catch {
      // ignore
    }

    if (patches.length > 0) {
      await this.ctx.publishSnapshot();
    }
  }

  private readFileContent(message: Message): MessageFileContent | null {
    if (message.type !== 2) return null;
    const content = message.content;
    if (typeof content !== "object" || content === null) return null;
    const candidate = content as Partial<MessageFileContent> & {
      type?: number;
    };
    if (candidate.type !== 2) return null;
    return candidate as MessageFileContent;
  }
}
