/**
 * Shared types and constants for the mobile notification subsystem.
 *
 * Pure type / constant module — no runtime side-effects, no platform
 * imports. Lives at the root of the `notifications/` folder so every
 * sibling module (channels, payload, chat, calls, …) can depend on it
 * without risk of circular imports.
 */

export const PENDING_NOTIFICATION_OPEN_KEY =
  "mushroom.mobile.pending-notification-open";
export const CALLS_CHANNEL_ID = "mushroom-calls";
// Low-importance channel + stable id for the in-call foreground service that
// keeps the process (and thus WebRTC media + signalling WS) alive while the
// app is backgrounded during an ongoing call. Android-only.
export const ONGOING_CALL_CHANNEL_ID = "mushroom-ongoing-call";
export const ONGOING_CALL_NOTIFICATION_ID = "mushroom-ongoing-call";
export const CALL_INVITE_NOTIFICATION_PREFIX = "mushroom-call-invite:";

export type MobileNotificationPayload = {
  type: "chat.message" | "call.invite" | "call.missed" | "sync.recovery";
  title: string;
  body: string;
  conversationId?: string;
  conversationName?: string;
  messageId?: string;
  callId?: string;
  callScope?: number;
  mediaType?: number;
  senderUserId?: number;
  senderDeviceId?: string;
  timeoutSeconds?: number;
  /** True when the message @-mentions the current user (or @all). */
  isMentioned?: boolean;
  /** True when the conversation is a group / channel. */
  isGroup?: boolean;
  /**
   * Recipient's total unread count, set server-side. Used to refresh the OS
   * app-icon badge from background/killed push delivery (Android fallback;
   * iOS uses APNs `aps.badge` natively).
   */
  badge?: number;
};

/**
 * Runtime context evaluated each time a notification candidate is dispatched.
 * Distinct from {@link MobileNotificationPayload} which carries data about the
 * message itself — this object carries data about the **app state** at the
 * moment the notification is about to fire.
 */
export type NotificationDisplayContext = {
  /**
   * "active" while the app is in the foreground; otherwise "background".
   * The server FCM/HMS background handler always supplies "background"
   * even when the device is technically displaying — that's still the
   * correct semantics for "OS owns the screen, our JS context just woke".
   */
  appState?: "active" | "background";
  /** True when the user is currently viewing this conversation. */
  isActiveConversation?: boolean;
  /** True when the conversation has `is_muted = 1` server-side. */
  isMuted?: boolean;
};

export type { MobilePushRegistration } from "../push-provider";

export type MobileNotificationPermissionStatus =
  | "authorized"
  | "denied"
  | "unknown";
