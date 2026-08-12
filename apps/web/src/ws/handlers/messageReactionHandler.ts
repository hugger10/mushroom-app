import type { MessageReactionMessage } from "../types";

export async function handleMessageReactionMessage(
  message: MessageReactionMessage
) {
  await window.electronAPI.applyMessageReaction({
    serverMessageId: message.server_message_id,
    serverConversationId: message.server_conversation_id,
    userId: message.user_id,
    emoji: message.emoji,
    action: message.action,
    updatedAt: message.updated_at
  });
}
