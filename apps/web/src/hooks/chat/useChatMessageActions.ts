import { useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import {
  getMessageSummaryText,
  type MergedForwardContent,
  type MergedForwardItem
} from "@mushroom/shared";
import { recallMessage, updateMessageState } from "../../http/api";
import type { Conversation, Message } from "../../types/chat";
import type { LoginUser } from "../../types/user";
import { buildForwardedContent } from "../useChatHelpers";
import { i18n } from "../../i18n";

type SendExistingMessage = (
  draftMessage: Message & { server_conversation_id: string },
  conversationSnapshot: Conversation
) => Promise<void>;

type UseChatMessageActionsOptions = {
  loginUser: LoginUser | null;
  activeConversation: Conversation | undefined;
  conversations: Conversation[];
  sendExistingMessage: SendExistingMessage;
};

export function useChatMessageActions({
  loginUser,
  activeConversation,
  conversations,
  sendExistingMessage
}: UseChatMessageActionsOptions) {
  // 防止用户在右键菜单上多次快速触发对同一条消息的撤回，
  // 与服务端 client_request_id 幂等中间件配合，UI 侧先拦截重复点击。
  const recallInFlightRef = useRef<Set<string>>(new Set());

  const handleRecallMessage = async (message: Message) => {
    if (!activeConversation || !message.server_message_id) return;
    const key = message.server_message_id;
    if (recallInFlightRef.current.has(key)) return;
    recallInFlightRef.current.add(key);
    try {
      const result = await recallMessage({
        messageId: message.server_message_id,
        conversationId: activeConversation.server_conversation_id
      });

      await window.electronAPI.applyMessageRecall({
        serverMessageId: result.data.message_id,
        serverConversationId: result.data.conversation_id,
        sequence: result.data.sequence,
        content: result.data.content,
        updatedAt: result.data.updated_at
      });
    } finally {
      recallInFlightRef.current.delete(key);
    }
  };

  const handleForwardMessage = async (
    message: Message,
    targetConversationId: string
  ) => {
    if (!loginUser) {
      return;
    }

    const targetConversation = conversations.find(
      conversation =>
        conversation.client_conversation_id === targetConversationId
    );

    if (!targetConversation) {
      throw new Error("Target conversation not found");
    }

    if (message.is_recalled) {
      throw new Error("Recalled messages cannot be forwarded");
    }

    const forwardedMessage: Message & { server_conversation_id: string } = {
      client_message_id: uuidv4(),
      server_message_id: "",
      client_conversation_id: targetConversation.client_conversation_id,
      server_conversation_id: targetConversation.server_conversation_id,
      type: message.type,
      status: 1,
      sequence: 0,
      content: buildForwardedContent(message, activeConversation),
      reply_to_message_id: null,
      reply_to: null,
      forward_from: null,
      sender_id: loginUser.userId,
      created_at: new Date().toISOString(),
      is_recalled: 0,
      is_favorited: 0,
      is_pinned: 0
    };

    await sendExistingMessage(forwardedMessage, targetConversation);
  };

  const handleToggleFavoriteMessage = async (message: Message) => {
    if (!activeConversation || !message.server_message_id) {
      return;
    }
    const nextValue = message.is_favorited ? 0 : 1;
    await window.electronAPI.updateMessageState({
      clientMessageId: message.client_message_id,
      is_favorited: nextValue
    });
    try {
      await updateMessageState({
        messageId: message.server_message_id,
        conversationId: activeConversation.server_conversation_id,
        is_favorited: nextValue
      });
    } catch (error) {
      await window.electronAPI.updateMessageState({
        clientMessageId: message.client_message_id,
        is_favorited: message.is_favorited ?? 0
      });
      throw error;
    }
  };

  const handleTogglePinMessage = async (message: Message) => {
    if (!activeConversation || !message.server_message_id) {
      return;
    }
    const nextValue = message.is_pinned ? 0 : 1;
    await window.electronAPI.updateMessageState({
      clientMessageId: message.client_message_id,
      is_pinned: nextValue
    });
    try {
      await updateMessageState({
        messageId: message.server_message_id,
        conversationId: activeConversation.server_conversation_id,
        is_pinned: nextValue
      });
    } catch (error) {
      await window.electronAPI.updateMessageState({
        clientMessageId: message.client_message_id,
        is_pinned: message.is_pinned ?? 0
      });
      throw error;
    }
  };

  const handleLoadMessageCollections = async (kind: "favorited" | "pinned") => {
    if (!activeConversation) {
      return [];
    }

    return window.electronAPI.getMessageCollections(
      activeConversation.client_conversation_id,
      kind,
      100
    );
  };

  /**
   * Forward multiple messages one-by-one: each message is sent individually
   * with a forwarded_from tag.
   */
  const handleBatchForwardOneByOne = async (
    messages: Message[],
    targetConversationId: string
  ) => {
    for (const message of messages) {
      await handleForwardMessage(message, targetConversationId);
    }
  };

  /**
   * Forward multiple messages merged into a single chat-record card.
   */
  const handleBatchForwardMerged = async (
    messages: Message[],
    targetConversationId: string
  ) => {
    if (!loginUser) return;

    const targetConversation = conversations.find(
      c => c.client_conversation_id === targetConversationId
    );
    if (!targetConversation) {
      throw new Error("Target conversation not found");
    }

    const senderNames = new Set<string>();
    const items: MergedForwardItem[] = [];
    const summaryLines: string[] = [];

    for (const msg of messages) {
      if (msg.is_recalled) continue;
      const senderName =
        msg.sender_nickname ||
        i18n.t("display.unknownUser", { id: msg.sender_id });
      senderNames.add(senderName);
      items.push({
        sender_id: msg.sender_id,
        sender_nickname: senderName,
        sender_avatar: msg.sender_avatar,
        content: msg.content,
        sent_at: msg.created_at
      });
      if (summaryLines.length < 3) {
        summaryLines.push(
          `${senderName}: ${getMessageSummaryText(msg.content)}`
        );
      }
    }

    const names = Array.from(senderNames);
    const title =
      names.length === 1
        ? i18n.t("display.forwardTitleSingle", { name: names[0] })
        : names.length === 2
          ? i18n.t("display.forwardTitleTwo", {
              nameA: names[0],
              nameB: names[1]
            })
          : i18n.t("display.forwardTitleGroup");

    const mergedContent: MergedForwardContent = {
      type: "merged_forward",
      text: `${i18n.t("messagePreview.mergedForward")} ${title}`,
      title,
      summary: summaryLines,
      messages: items
    };

    const mergedMessage: Message & { server_conversation_id: string } = {
      client_message_id: uuidv4(),
      server_message_id: "",
      client_conversation_id: targetConversation.client_conversation_id,
      server_conversation_id: targetConversation.server_conversation_id,
      type: 1,
      status: 1,
      sequence: 0,
      content: mergedContent as unknown as Record<string, unknown>,
      reply_to_message_id: null,
      reply_to: null,
      forward_from: null,
      sender_id: loginUser.userId,
      created_at: new Date().toISOString(),
      is_recalled: 0,
      is_favorited: 0,
      is_pinned: 0
    };

    await sendExistingMessage(mergedMessage, targetConversation);
  };

  const handleSendTextToConversation = async (
    targetConversationId: string,
    text: string
  ) => {
    if (!loginUser || !text.trim()) return;
    const targetConversation = conversations.find(
      c => c.client_conversation_id === targetConversationId
    );
    if (!targetConversation) return;

    const textMessage: Message & { server_conversation_id: string } = {
      client_message_id: uuidv4(),
      server_message_id: "",
      client_conversation_id: targetConversation.client_conversation_id,
      server_conversation_id: targetConversation.server_conversation_id,
      type: 1,
      status: 1,
      sequence: 0,
      content: { type: 1, text: text.trim() },
      reply_to_message_id: null,
      reply_to: null,
      forward_from: null,
      sender_id: loginUser.userId,
      created_at: new Date().toISOString(),
      is_recalled: 0,
      is_favorited: 0,
      is_pinned: 0
    };

    await sendExistingMessage(textMessage, targetConversation);
  };

  return {
    handleRecallMessage,
    handleForwardMessage,
    handleBatchForwardOneByOne,
    handleBatchForwardMerged,
    handleSendTextToConversation,
    handleToggleFavoriteMessage,
    handleTogglePinMessage,
    handleLoadMessageCollections
  };
}
