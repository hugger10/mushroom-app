import type { Conversation } from "../types/models";
import { getMessageSummaryText } from "./message-content";
import {
  getSystemMessageText,
  isSystemMessageContent,
  type SystemMessageTranslate
} from "./system-message";

type ConversationPreviewLike = Pick<
  Conversation,
  | "draft"
  | "mention_unread_count"
  | "last_message_content"
  | "type"
  | "display_name"
>;

function hasPreviewableLastMessage(conv?: ConversationPreviewLike | null) {
  const content = conv?.last_message_content;
  if (!content) {
    return false;
  }
  if (typeof content !== "object") {
    return true;
  }

  return Object.keys(content).length > 0;
}

export function getConversationContentPreview(
  conv?: ConversationPreviewLike | null,
  translate?: SystemMessageTranslate
): string {
  const tr = (key: string, fallback: string, opts?: Record<string, unknown>) =>
    translate ? translate(key, { defaultValue: fallback, ...opts }) : fallback;

  if (conv?.draft && conv.draft.trim()) {
    const draft = conv.draft.trim();
    return tr("conversationList.previewDraft", `[草稿] ${draft}`, { draft });
  }

  if (!hasPreviewableLastMessage(conv)) {
    return tr("conversationList.previewEmpty", "暂无消息");
  }

  const conversation = conv as ConversationPreviewLike;

  const mentionPrefix =
    (conversation.mention_unread_count ?? 0) > 0
      ? tr("conversationList.previewMentionPrefix", "[有人@你] ")
      : "";

  if (isSystemMessageContent(conversation.last_message_content)) {
    return `${mentionPrefix}${getSystemMessageText(conversation.last_message_content, translate)}`;
  }

  const messageText = getMessageSummaryText(
    conversation.last_message_content,
    translate
  );
  if (conversation.type === 1) {
    return `${mentionPrefix}${messageText}`;
  }

  const senderName =
    conversation.display_name ||
    tr("conversationList.previewUnknownSender", "未知");
  return `${mentionPrefix}${senderName}: ${messageText}`;
}
