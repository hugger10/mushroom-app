import type { MessageRecallMessage } from "../types";

export async function handleMessageRecallMessage(
  message: MessageRecallMessage
) {
  await window.electronAPI.applyMessageRecall({
    serverMessageId: message.server_message_id,
    serverConversationId: message.server_conversation_id,
    sequence: message.sequence,
    content: message.content,
    updatedAt: message.updated_at
  });
}
