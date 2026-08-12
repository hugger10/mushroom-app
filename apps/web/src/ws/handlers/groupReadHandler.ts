import type { GroupReadMessage } from "../types";
import log from "@/utils/log";

/**
 * 群聊已读高水位推进（仅消息原作者会收到此帧）。
 *
 * 当前实现：透传到 main 进程的 `applyGroupRead`（如果存在）。
 * 该 IPC 接口尚未在 electron main 实现，先在 preload 缺失时仅打 debug，
 * 待 Phase 3 desktop 端落地后再补齐 main 侧的 in-memory cache + UI 通知。
 */
export async function handleGroupReadMessage(message: GroupReadMessage) {
  log.debug("处理群已读同步:", message);
  const applyGroupRead = (
    window.electronAPI as unknown as {
      applyGroupRead?: (payload: {
        serverConversationId: string;
        messageSenderId: number;
        readerUserId: number;
        lastReadSeq: number;
        updatedAt?: string;
      }) => Promise<void>;
    }
  ).applyGroupRead;
  if (typeof applyGroupRead !== "function") {
    return;
  }
  await applyGroupRead({
    serverConversationId: String(message.conversation_id ?? ""),
    messageSenderId: Number(message.message_sender_id ?? 0),
    readerUserId: Number(message.reader_user_id ?? 0),
    lastReadSeq: Number(message.last_read_seq ?? 0),
    updatedAt: message.updated_at
  });
}
