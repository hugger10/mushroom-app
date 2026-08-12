/**
 * Barrel re-export — preserves the historical import path
 * (`apps/mobile/src/platform/notification-center`) while the
 * implementation lives under `./notifications/*`. See
 * `docs/architecture/push-notification.md` for the module map.
 */

export type {
  MobileNotificationPayload,
  NotificationDisplayContext,
  MobileNotificationPermissionStatus,
  MobilePushRegistration
} from "./notifications/types";

export {
  setMutedConversationResolver,
  buildPushDisplayContext,
  parseNotificationPayload,
  __resetChatNotificationDedup
} from "./notifications/payload";

export {
  getNotificationPermissionStatus,
  requestNotificationPermission,
  openSystemNotificationSettings
} from "./notifications/permissions";

export {
  displayLocalNotification,
  displayChatMessageNotification
} from "./notifications/chat";

export {
  displayIncomingCallNotification,
  clearIncomingCallNotification
} from "./notifications/calls";

export {
  startOngoingCallService,
  stopOngoingCallService
} from "./notifications/ongoing-call";

export {
  syncPushRegistration,
  consumePendingNotificationOpen
} from "./notifications/registration";

export {
  initializeNotificationCenter,
  registerNotificationBackgroundHandlers
} from "./notifications/lifecycle";

export { setAppBadgeCount, clearAppBadge } from "./notifications/badge";
