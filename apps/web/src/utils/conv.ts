import {
  getMessageSummaryText,
  getSystemMessageText,
  isSystemMessageContent
} from "@mushroom/shared";
import i18next from "i18next";
import type { Conversation } from "../types/chat";
import type { LoginUser } from "../types/user";
import { getConversationSenderDisplayName } from "./display";

function hasPreviewableLastMessage(conversation?: Conversation | null) {
  const content = conversation?.last_message_content;
  if (!content) {
    return false;
  }
  if (typeof content !== "object") {
    return true;
  }

  return Object.keys(content).length > 0;
}

export function getConversationContentPreview(
  conversation?: Conversation | null,
  loginUser?: LoginUser | null,
  selfPrefix?: string
) {
  if (!conversation) {
    return i18next.t("conversationList.previewEmpty");
  }

  if (conversation.draft && conversation.draft.trim()) {
    return i18next.t("conversationList.previewDraft", {
      draft: conversation.draft.trim()
    });
  }

  if (!hasPreviewableLastMessage(conversation)) {
    return i18next.t("conversationList.previewEmpty");
  }

  const mentionPrefix =
    (conversation.mention_unread_count ?? 0) > 0
      ? i18next.t("conversationList.previewMentionPrefix")
      : "";

  if (isSystemMessageContent(conversation.last_message_content)) {
    return `${mentionPrefix}${getSystemMessageText(
      conversation.last_message_content,
      i18next.t.bind(i18next)
    )}`;
  }

  const messageText = getMessageSummaryText(conversation.last_message_content);

  // 私聊：不显示发送者前缀（自己发的通过 tick 图标标识）
  if (conversation.type === 1) {
    return `${mentionPrefix}${messageText}`;
  }

  // 群聊：自己发的显示"你"/"You"，否则显示发送者名
  const isSelf =
    loginUser &&
    Number(conversation.last_message_send_id || 0) === loginUser.userId;
  if (isSelf && selfPrefix) {
    return `${mentionPrefix}${selfPrefix}: ${messageText}`;
  }

  const senderName = getConversationSenderDisplayName(conversation, loginUser);
  return senderName
    ? `${mentionPrefix}${senderName}: ${messageText}`
    : `${mentionPrefix}${messageText}`;
}

export function getColorFromName(name: string) {
  const colors = [
    "#f56a00",
    "#7265e6",
    "#ffbf00",
    "#00a2ae",
    "#52c41a",
    "#1677ff"
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}
