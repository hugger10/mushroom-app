import { isRetryableOutgoingError, type TypingMessage } from "@mushroom/shared";
import {
  mobileAppController,
  mobileRealtimeClient
} from "../../../services/app-runtime";
import type { ChatMessage, MessageActionsCtx } from "./types";
import { i18n } from "../../../i18n";

export function createSendingActions(ctx: MessageActionsCtx) {
  const { state } = ctx;

  async function updateTypingState(
    active: boolean,
    activity: "text" | "voice" = "text"
  ) {
    const normalizedConversation = ctx.getNormalizedActiveConversation();
    const currentUserId = state.snapshot?.auth.user?.userId;

    if (
      !normalizedConversation ||
      !currentUserId ||
      !normalizedConversation.server_conversation_id
    ) {
      return;
    }

    const signalKey = `${activity}:${active ? "1" : "0"}`;
    if (state.lastTypingSignalKeyRef.current === signalKey) {
      if (active) {
        if (activity === "text") {
          ctx.scheduleTypingStopSignal();
        }
      }
      return;
    }

    state.lastTypingSignalKeyRef.current = signalKey;
    const payload: TypingMessage = {
      messageClassify: "typing",
      conversation_id: normalizedConversation.server_conversation_id,
      sender_user_id: Number(currentUserId),
      active,
      activity,
      timestamp: new Date().toISOString()
    };

    try {
      await mobileRealtimeClient.sendMessage(payload);
    } catch {
      // Typing state is best-effort. Ignore websocket failures here.
    }

    if (active && activity === "text") {
      ctx.scheduleTypingStopSignal();
      return;
    }

    if (state.typingSignalTimerRef.current) {
      clearTimeout(state.typingSignalTimerRef.current);
      state.typingSignalTimerRef.current = null;
    }
  }

  async function sendPreparedMessage(
    message: ChatMessage,
    successStatus: string
  ) {
    state.setPending(true);
    state.setError("");

    try {
      await mobileAppController.markOutgoingMessageSending({
        clientConversationId: message.client_conversation_id,
        clientMessageId: message.client_message_id
      });
      const ack = await mobileRealtimeClient.sendChatMessage(message);
      await mobileAppController.confirmMessageAck(ack);
      if (successStatus) {
        state.setStatus(successStatus);
      }
    } catch (currentError) {
      const messageText =
        currentError instanceof Error
          ? currentError.message
          : String(currentError ?? "");
      await mobileAppController.failMessageSend({
        clientConversationId: message.client_conversation_id,
        clientMessageId: message.client_message_id,
        errorMessage: messageText
      });
      // Permanent business errors (blocked / muted) are surfaced inline below
      // the message bubble via `last_error`. Do not duplicate as a bottom toast.
      // Retryable errors (network etc.) keep the existing toast so the user
      // gets immediate feedback while the auto-retry queue handles delivery.
      if (isRetryableOutgoingError(messageText)) {
        state.setError(messageText);
        state.setStatus(i18n.t("chatMessage.sendFailed"));
      } else {
        state.setError("");
      }
    } finally {
      state.setPending(false);
    }
  }

  async function handleSendMessage() {
    if (!state.activeConversation || !state.composerText.trim()) {
      return;
    }
    const mentionDraft = ctx.buildMentionDraft(state.composerText);

    // Capture values that will be cleared before the await so they are
    // still available for createOptimisticTextMessage below.
    const textToSend = state.composerText;
    const replyTargetId = state.replyTargetId;

    // Clear composer and related transient UI state synchronously BEFORE the
    // await so React batches these setStates together with the publishSnapshot
    // setState triggered inside createOptimisticTextMessage.  This avoids a
    // visible two-frame split where the message bubble already appears but
    // the composer still shows the unsent text.
    state.setComposerText("");
    state.setComposerToolsVisible(false);
    state.setReplyTargetId(null);
    state.setSelectedMessageId(null);

    const optimisticMessage =
      await mobileAppController.createOptimisticTextMessage({
        clientConversationId: state.activeConversation.client_conversation_id,
        text: textToSend,
        mentions: mentionDraft.mentions,
        mentionAll: mentionDraft.mentionAll,
        replyToClientMessageId: replyTargetId
      });

    void ctx.updateTypingState(false, "text");
    // The in-bubble loading spinner expresses "sending" state — avoid a
    // redundant bottom toast that would flash even on instant rejections.
    await sendPreparedMessage(optimisticMessage, "");
  }

  return {
    updateTypingState,
    sendPreparedMessage,
    handleSendMessage
  };
}
