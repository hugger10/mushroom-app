/**
 * Pure / side-effect-free notification policy helpers.
 *
 * Lives outside `notification-center.ts` so that suppression rules and
 * dedup behavior can be unit-tested with `node --test` without pulling
 * React Native, Notifee, or MMKV into the runtime.
 *
 * `notification-center.ts` is the thin Notifee-backed integration layer
 * that calls into these helpers with concrete preference + runtime
 * context at fire-time.
 */

import type { MobileNotificationPreferences } from "./notification-preferences";

export type NotificationPolicyPayload = {
  type: "chat.message" | "call.invite" | "call.missed" | "sync.recovery";
  isMentioned?: boolean;
  isGroup?: boolean;
};

export type NotificationPolicyContext = {
  /** "active" = JS app is foregrounded, "background" = backgrounded / killed-but-woken. */
  appState?: "active" | "background";
  /** True when the user is currently looking at the source conversation. */
  isActiveConversation?: boolean;
  /** Server-side per-conversation mute flag. */
  isMuted?: boolean;
  /** Current wall-clock; injectable for tests. */
  now?: Date;
};

function parseTimeMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function isQuietHoursActive(
  preferences: MobileNotificationPreferences,
  now = new Date()
) {
  if (!preferences.quietHoursEnabled) {
    return false;
  }

  const start = parseTimeMinutes(preferences.quietHoursStart);
  const end = parseTimeMinutes(preferences.quietHoursEnd);
  const current = now.getHours() * 60 + now.getMinutes();

  if (start === end) {
    return true;
  }

  if (start < end) {
    return current >= start && current < end;
  }

  return current >= start || current < end;
}

/**
 * Decide whether a notification payload should reach the OS, given user
 * preferences and runtime context. Mirrors `apps/web` desktop behavior:
 *
 * - Chat message + foreground + active conversation → suppress.
 * - Chat message + foreground + `inAppBannerEnabled === false` → suppress.
 * - Group chat + `groupMessagesEnabled === false` → suppress unless @-mention.
 * - `mentionOnly === true` + not @-mentioned → suppress.
 * - Conversation muted + not @-mentioned → suppress.
 * - Quiet hours active → suppress unless quiet-hours-allow-mentions and @-mention.
 *
 * Call notifications go through their own `callsEnabled` gate and quiet-hours
 * allow-calls exception.
 */
export function shouldDisplayNotification(
  payload: NotificationPolicyPayload,
  preferences: MobileNotificationPreferences,
  context: NotificationPolicyContext = {}
) {
  const isCallPayload =
    payload.type === "call.invite" || payload.type === "call.missed";

  if (isCallPayload && !preferences.callsEnabled) {
    return false;
  }

  if (!isCallPayload && !preferences.messagesEnabled) {
    return false;
  }

  if (payload.type === "chat.message") {
    const appState = context.appState ?? "active";
    const isActive = Boolean(context.isActiveConversation);
    const isMentioned = Boolean(payload.isMentioned);

    if (appState === "active" && isActive) {
      return false;
    }

    if (appState === "active" && !preferences.inAppBannerEnabled) {
      return false;
    }

    if (payload.isGroup && !preferences.groupMessagesEnabled && !isMentioned) {
      return false;
    }

    if (preferences.mentionOnly && !isMentioned) {
      return false;
    }

    if (context.isMuted && !isMentioned) {
      return false;
    }
  }

  if (!isQuietHoursActive(preferences, context.now)) {
    return true;
  }

  if (isCallPayload) {
    return preferences.quietHoursAllowCalls;
  }

  if (payload.type === "chat.message") {
    return Boolean(payload.isMentioned) && preferences.quietHoursAllowMentions;
  }

  return false;
}

/**
 * In-memory dedup helper for chat-message notifications. The same message
 * id may arrive twice on the same device when the server pushes via FCM /
 * HMS / Xiaomi while the WebSocket pipe also delivers the message in the
 * foreground. Capped at {@link capacity} (FIFO eviction) and entries
 * expire after {@link ttlMs}.
 */
export function createNotificationDedup(options?: {
  capacity?: number;
  ttlMs?: number;
}) {
  const capacity = options?.capacity ?? 500;
  const ttlMs = options?.ttlMs ?? 5 * 60 * 1000;
  const seen = new Map<string, number>();

  function reserve(id: string | undefined, now: number = Date.now()) {
    if (!id) {
      return true;
    }
    const existing = seen.get(id);
    if (existing !== undefined && now - existing < ttlMs) {
      return false;
    }
    seen.set(id, now);
    if (seen.size > capacity) {
      const overflow = seen.size - capacity;
      let dropped = 0;
      for (const key of seen.keys()) {
        if (dropped >= overflow) {
          break;
        }
        seen.delete(key);
        dropped += 1;
      }
    }
    return true;
  }

  function reset() {
    seen.clear();
  }

  /**
   * Release a previously-reserved id. Used by the call site when the
   * downstream display attempt failed: without releasing, a retry from
   * an alternate transport (WS vs push) would be silently deduped and
   * the user would never see the message.
   *
   * No-op when the id is missing or was never reserved.
   */
  function release(id: string | undefined) {
    if (!id) {
      return;
    }
    seen.delete(id);
  }

  function size() {
    return seen.size;
  }

  return { reserve, release, reset, size };
}
