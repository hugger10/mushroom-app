import i18next from "i18next";
import {
  getMessageSummaryText,
  type MergedForwardContent,
  type MergedForwardItem,
  type Message
} from "@mushroom/shared";
import { mobileAppController } from "../../../services/app-runtime";
import { getMessageSenderAvatar } from "../../../utils/display";
import type { MessageActionsCtx } from "./types";

export function createForwardActions(ctx: MessageActionsCtx) {
  const { state } = ctx;

  async function handleForwardToConversation(
    targetConversationId: string,
    extraMessage?: string,
    overrideMessageId?: string
  ) {
    const messageId = overrideMessageId || state.forwardingMessageId;
    if (!state.activeConversation || !messageId) {
      return;
    }

    const prepared = await mobileAppController.createOptimisticForwardMessage({
      sourceClientConversationId:
        state.activeConversation.client_conversation_id,
      sourceClientMessageId: messageId,
      targetClientConversationId: targetConversationId
    });
    state.setForwardingMessageId(null);
    state.setSelectedMessageId(null);
    await ctx.sendPreparedMessage(prepared, "");

    if (extraMessage) {
      const textMsg = await mobileAppController.createOptimisticTextMessage({
        clientConversationId: targetConversationId,
        text: extraMessage
      });
      await ctx.sendPreparedMessage(textMsg, "");
    }

    state.setActiveConversationId(targetConversationId);
  }

  async function handleBatchForwardToConversation(
    targetConversationId: string,
    mode: "one-by-one" | "merged",
    selectedMessages: Message[],
    extraMessage?: string
  ) {
    if (!state.activeConversation || selectedMessages.length === 0) {
      return;
    }

    if (mode === "one-by-one") {
      for (const msg of selectedMessages) {
        await handleForwardToConversation(
          targetConversationId,
          undefined,
          msg.client_message_id
        );
      }
    } else {
      // merged forward
      const senderNames = new Set<string>();
      const items: MergedForwardItem[] = [];
      const summaryLines: string[] = [];
      const sourceConversation = state.activeConversation;
      const sourceContacts = state.contacts ?? [];
      const sourceLoginUser = state.snapshot?.auth.user ?? null;

      for (const msg of selectedMessages) {
        const senderName =
          msg.sender_nickname ||
          i18next.t("display.unknownUser", { id: msg.sender_id });
        senderNames.add(senderName);
        const resolvedAvatar = sourceConversation
          ? getMessageSenderAvatar({
              message: msg,
              conversation: sourceConversation,
              contacts: sourceContacts,
              loginUser: sourceLoginUser
            })
          : msg.sender_avatar;
        items.push({
          sender_id: msg.sender_id,
          sender_nickname: senderName,
          sender_avatar: resolvedAvatar || undefined,
          content: msg.content,
          sent_at: msg.created_at
        });
        if (summaryLines.length < 3) {
          summaryLines.push(
            `${senderName}: ${getMessageSummaryText(msg.content, i18next.t.bind(i18next))}`
          );
        }
      }

      const names = Array.from(senderNames);
      const title =
        names.length === 1
          ? i18next.t("display.forwardTitleSingle", { name: names[0] })
          : names.length === 2
            ? i18next.t("display.forwardTitleTwo", {
                nameA: names[0],
                nameB: names[1]
              })
            : i18next.t("display.forwardTitleGroup");

      const mergedContent: MergedForwardContent = {
        type: "merged_forward",
        text: `${i18next.t("messagePreview.mergedForward")} ${title}`,
        title,
        summary: summaryLines,
        messages: items
      };

      const prepared =
        await mobileAppController.createOptimisticMergedForwardMessage({
          targetClientConversationId: targetConversationId,
          content: mergedContent as unknown as Record<string, unknown>
        });

      await ctx.sendPreparedMessage(prepared, "");
    }

    if (extraMessage) {
      const textMsg = await mobileAppController.createOptimisticTextMessage({
        clientConversationId: targetConversationId,
        text: extraMessage
      });
      await ctx.sendPreparedMessage(textMsg, "");
    }

    state.exitMultiSelectMode();
    state.setBatchForwardMode(null);
    state.setActiveConversationId(targetConversationId);
    state.setStatus("");
  }

  return {
    handleForwardToConversation,
    handleBatchForwardToConversation
  };
}
