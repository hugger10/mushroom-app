/**
 * Pure-ish payload helpers: parsing wire envelopes into
 * {@link MobileNotificationPayload}, evaluating the suppression policy,
 * computing the displayed body string, the chat-message dedup window,
 * and the muted-conversation resolver injected from `app-runtime`.
 *
 * No Notifee / no React Native imports — keeps these utilities testable
 * and free of the channels/permissions side-effects.
 */

import { readNotificationPreferences } from "../notification-preferences";
import {
  createNotificationDedup,
  shouldDisplayNotification,
  type NotificationPolicyContext
} from "../notification-policy";
import { readActiveConversation } from "../active-conversation";
import type { NormalizedPushRemoteMessage } from "../push-provider";
import { notifyLog, parseNumberValue } from "./runtime";
import type {
  MobileNotificationPayload,
  NotificationDisplayContext
} from "./types";
import { i18n } from "../../i18n";

/**
 * Resolver returning the muted-state for a conversation. Injected from
 * {@link app-runtime} at boot so this module does not import the
 * repository directly (avoids circular dependency: repository →
 * controller → notification-center → repository).
 *
 * Default resolver returns `false` — meaning "not muted" — so that
 * pre-boot or background-wake paths (where the repository has not been
 * initialised yet) **prefer to show** rather than silently drop a
 * potentially urgent notification.
 */
type MutedConversationResolver = (
  conversationId: string | undefined
) => Promise<boolean> | boolean;
let mutedConversationResolver: MutedConversationResolver = () => false;

export function setMutedConversationResolver(
  resolver: MutedConversationResolver
) {
  mutedConversationResolver = resolver;
}

/**
 * In-memory dedup window for chat-message notifications. The same message
 * id may arrive twice on the **same** device when:
 *   - the device is online (WS path) AND the server also issues an FCM /
 *     HMS / Xiaomi push (server does not currently dedup per-device);
 *   - a push arrives while the WS pipe is reconnecting and replays history.
 *
 * Both paths (WS dispatcher and push handlers) call `reserve` before
 * showing. Logic / policy lives in `./notification-policy` so it can be
 * tested without React Native; this is just the singleton instance bound
 * to the actual notifee call site.
 */
export const chatNotificationDedup = createNotificationDedup();

/** Exposed for tests. */
export function __resetChatNotificationDedup() {
  chatNotificationDedup.reset();
}

export function parseNotificationPayload(
  data: Record<string, unknown> | null | undefined,
  fallback?: {
    title?: string | null;
    body?: string | null;
  }
): MobileNotificationPayload | null {
  if (!data) {
    return null;
  }

  const type = String(data.type ?? "").trim();
  if (
    type !== "chat.message" &&
    type !== "call.invite" &&
    type !== "call.missed" &&
    type !== "sync.recovery"
  ) {
    notifyLog.warn("malformed payload: unknown type", { type });
    return null;
  }

  return {
    type,
    title: String(data.title ?? fallback?.title ?? "Mushroom"),
    body: String(data.body ?? fallback?.body ?? ""),
    conversationId:
      typeof data.conversation_id === "string"
        ? data.conversation_id
        : undefined,
    conversationName:
      typeof data.conversation_name === "string"
        ? data.conversation_name
        : undefined,
    messageId:
      typeof data.message_id === "string" ? data.message_id : undefined,
    callId: typeof data.call_id === "string" ? data.call_id : undefined,
    callScope: parseNumberValue(data.call_scope),
    mediaType: parseNumberValue(data.media_type),
    senderUserId: parseNumberValue(data.sender_user_id),
    senderDeviceId:
      typeof data.sender_device_id === "string"
        ? data.sender_device_id
        : undefined,
    timeoutSeconds: parseNumberValue(data.timeout_seconds),
    badge: parseNumberValue(data.badge)
  };
}

export function parseRemoteNotificationPayload(
  message: NormalizedPushRemoteMessage
) {
  return parseNotificationPayload(message.data, {
    title: message.notification?.title,
    body: message.notification?.body
  });
}

export function shouldDisplayPayload(
  payload: MobileNotificationPayload,
  context: NotificationDisplayContext = {}
) {
  const preferences = readNotificationPreferences();
  return shouldDisplayNotification(
    {
      type: payload.type,
      isMentioned: payload.isMentioned,
      isGroup: payload.isGroup
    },
    preferences,
    context as NotificationPolicyContext
  );
}

export function getDisplayBody(payload: MobileNotificationPayload) {
  const preferences = readNotificationPreferences();
  if (payload.type !== "chat.message") {
    return payload.body;
  }

  if (preferences.previewMode === "hidden") {
    return i18n.t("notifications.newMessage");
  }

  if (preferences.previewMode === "sender") {
    return i18n.t("notifications.messageFrom", {
      name: payload.conversationName || payload.title
    });
  }

  return payload.body;
}

/**
 * Build a {@link NotificationDisplayContext} for a push-originated
 * payload. Push handlers do not have access to React state or the
 * controller's in-memory mute table; this helper reconstructs the same
 * suppression inputs from device-level state (`active conversation` slot
 * + injected mute resolver).
 *
 * @param appStateOverride caller may force the state to "background"
 *   when running inside the FCM/HMS background JS task even if
 *   `AppState.currentState` happens to report "active".
 */
export async function buildPushDisplayContext(
  payload: MobileNotificationPayload,
  appStateOverride?: "active" | "background"
): Promise<NotificationDisplayContext> {
  const activeConversationId = readActiveConversation();
  const isActiveConversation =
    !!payload.conversationId && activeConversationId === payload.conversationId;
  let isMuted = false;
  try {
    isMuted = await mutedConversationResolver(payload.conversationId);
  } catch (error) {
    notifyLog.warn("mutedConversationResolver threw; defaulting to not muted", {
      error: (error as Error)?.message
    });
    isMuted = false;
  }
  return {
    appState: appStateOverride ?? "background",
    isActiveConversation,
    isMuted
  };
}
