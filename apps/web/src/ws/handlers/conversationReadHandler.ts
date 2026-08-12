import type { ConversationReadMessage } from "../types";
import log from "@/utils/log";

export async function handleConversationReadMessage(
  message: ConversationReadMessage
) {
  log.debug("处理会话已读同步:", message);
  await window.electronAPI.applyConversationRead({
    serverConversationId: message.conversation_id,
    readSequence: message.read_seq,
    unreadCount: message.unread_count,
    updatedAt: message.updated_at
  });
}
