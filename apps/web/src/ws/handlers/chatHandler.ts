import type { ChatMessage } from "../types";
import log from "@/utils/log";
import {
  fetchRemoteConversations,
  fetchRemoteMessages
} from "../../sync/syncContext";

export async function handleChatMessage(message: ChatMessage) {
  log.debug("处理聊天消息:", message);

  const serverConversationId = message.server_conversation_id;
  if (!serverConversationId) {
    log.warn("Chat message missing server conversation id", {
      clientMessageId: message.client_message_id
    });
    return;
  }

  let conversation =
    await window.electronAPI.getConversationsByServerId(serverConversationId);

  if (!conversation) {
    const lastConversationsSync =
      (await window.electronAPI.getLastSyncTime("conversations")) ?? undefined;
    const syncResult = await fetchRemoteConversations(lastConversationsSync);
    await window.electronAPI.updateLastSyncTime(
      "conversations",
      syncResult.syncCursor
    );
    const targetConversationSync = syncResult.updatedConversations.filter(
      item => String(item.conversation_id) === String(serverConversationId)
    );
    if (targetConversationSync.length > 0) {
      await fetchRemoteMessages(targetConversationSync);
    }
    conversation =
      await window.electronAPI.getConversationsByServerId(serverConversationId);
  }

  if (conversation) {
    message.client_conversation_id = conversation.client_conversation_id;
  } else {
    log.warn(
      `未找到对应的本地会话，server_conversation_id: ${serverConversationId}`
    );
    return;
  }
  // 保存消息到本地数据库
  await window.electronAPI.addMessage(message);
}
