/**
 * Active conversation tracker.
 *
 * Persisted in {@link deviceStorage} so that **any** code path can read
 * which conversation the user is currently focused on — including the
 * FCM/HMS background push handler, which runs in a transient JS context
 * (often with the React tree torn down) and therefore cannot safely
 * touch a React store or in-memory module variable.
 *
 * Conventions:
 * - The mobile chat screen sets this on focus and clears on blur (see
 *   `apps/mobile/src/app/screens/ChatScreen`); other surfaces (settings,
 *   conversation list) never write here.
 * - We deliberately do **not** clear on `AppState` → "background". Users
 *   coming back to the foreground expect the same conversation to still
 *   be considered "active". While backgrounded, any incoming push goes
 *   through the system notification flow anyway, so the value mostly
 *   affects foreground heads-up suppression in
 *   {@link shouldDisplayNotification}.
 * - We store the **client_conversation_id** (matching what
 *   `MobileNotificationPayload.conversationId` and
 *   `MobileAppController` use for snapshots).
 */
import { deviceStorage } from "../data/storage";

const ACTIVE_CONVERSATION_KEY = "mushroom.mobile.active-conversation-id";

export function setActiveConversation(
  conversationId: string | null | undefined
): void {
  if (!conversationId) {
    deviceStorage.remove(ACTIVE_CONVERSATION_KEY);
    return;
  }
  deviceStorage.set(ACTIVE_CONVERSATION_KEY, conversationId);
}

export function readActiveConversation(): string | null {
  return deviceStorage.getString(ACTIVE_CONVERSATION_KEY) ?? null;
}

/**
 * Safe-release helper: only clears the slot when it still points at the
 * given conversation id. Prevents fast taps between conversations from
 * having the second mount's cleanup clobber the third mount's set.
 */
export function clearActiveConversationIfMatches(
  conversationId: string | null | undefined
): void {
  if (!conversationId) {
    return;
  }
  if (deviceStorage.getString(ACTIVE_CONVERSATION_KEY) === conversationId) {
    deviceStorage.remove(ACTIVE_CONVERSATION_KEY);
  }
}
