import type { IncomingChatMessageContext } from "@mushroom/app-core";
import { AppState } from "react-native";
import { getMessageSummaryText } from "@mushroom/shared";
import {
  displayChatMessageNotification,
  setMutedConversationResolver
} from "../../platform/notification-center";
import log from "../../utils/log";
import { bootRepository } from "./boot-stubs";

const runtimeLog = log.scope("runtime");

/**
 * Wire the notification center's "is this conversation muted?" lookup to
 * the active session's repository. Runs synchronously at module-load
 * time so the FCM/HMS background handler — which may execute before the
 * controller has even called `bindUser` — finds a resolver registered.
 *
 * When no session is bound yet (cold push wake), {@link bootRepository}'s
 * Proxy returns the NULL_REPOSITORY whose `getConversationByClientId` is
 * not implemented; we catch and degrade to "not muted" so the user
 * still sees the notification.
 */
setMutedConversationResolver(async conversationId => {
  if (!conversationId) {
    return false;
  }
  try {
    const repo = bootRepository as unknown as {
      getConversationByClientId?: (
        id: string
      ) => Promise<{ is_muted?: number | null } | null>;
    };
    if (typeof repo.getConversationByClientId !== "function") {
      return false;
    }
    const conversation = await repo.getConversationByClientId(conversationId);
    return Number(conversation?.is_muted ?? 0) > 0;
  } catch {
    return false;
  }
});

/**
 * Bridge between the controller's "new inbound chat message" hook and the
 * mobile notification center. The controller is unaware of notification
 * mechanics; it only reports the event. Here we translate it into the
 * right Notifee invocation, supplying app-state / active-conversation /
 * mute context so the suppression rules match WhatsApp/Telegram.
 */
export async function dispatchIncomingChatMessageNotification(
  ctx: IncomingChatMessageContext
) {
  try {
    const appState =
      AppState.currentState === "active" ? "active" : "background";
    const conversation = ctx.conversation;
    const message = ctx.message;
    const isGroup = conversation.type === 2;
    const body = getMessageSummaryText(message.content);

    await displayChatMessageNotification({
      conversationId: conversation.client_conversation_id,
      conversationName: conversation.name,
      messageId: message.server_message_id || message.client_message_id,
      senderUserId: (() => {
        // A4: `sender_id` is a numeric column server-side but may arrive
        // as string or number. `Number(x) || undefined` drops legitimate
        // user id `0` (impossible in production, but defensive) and also
        // any non-finite value. Use Number.isFinite to keep `0` while
        // still rejecting NaN / Infinity.
        const n = Number(message.sender_id);
        return Number.isFinite(n) ? n : undefined;
      })(),
      senderName: message.sender_nickname,
      body,
      isMentioned: ctx.isMentioned,
      isGroup,
      context: {
        appState,
        isActiveConversation: ctx.isActiveConversation,
        isMuted: Number(conversation.is_muted || 0) > 0
      }
    });
  } catch (err) {
    runtimeLog.warn("dispatchIncomingChatMessageNotification failed", err);
  }
}
