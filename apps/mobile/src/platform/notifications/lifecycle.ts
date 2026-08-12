/**
 * Boot-time wiring for the notification subsystem:
 *   - {@link initializeNotificationCenter} attaches foreground listeners
 *     (push provider + Notifee press events + cold-open hand-off);
 *   - {@link registerNotificationBackgroundHandlers} attaches the
 *     background JS tasks (FCM/HMS payload + Notifee press in background).
 *
 * These two entry points encapsulate every observable side-effect of the
 * `notifications/*` modules so that `app-runtime` / `useMobileAppEffects`
 * have a single place to wire and unwire.
 */

import { Platform } from "react-native";
import {
  initializeUnifiedPush,
  registerUnifiedPushBackgroundHandler,
  type MobilePushRegistration
} from "../push-provider";
import { runIosToneFallbackCheck } from "../alert-tones/tone-manager";
import { displayLocalNotification } from "./chat";
import {
  clearIncomingCallNotification,
  displayIncomingCallNotification
} from "./calls";
import { setAppBadgeCount } from "./badge";
import {
  buildPushDisplayContext,
  parseNotificationPayload,
  parseRemoteNotificationPayload
} from "./payload";
import {
  getNotifeeRuntime,
  notifyLog,
  persistPendingNotificationOpen
} from "./runtime";
import {
  endSystemCall,
  handleNotificationCallAction,
  reportIncomingSystemCall
} from "../system-call";
import type { MobileNotificationPayload } from "./types";

let backgroundHandlersRegistered = false;

/**
 * The subset of a Notifee press event needed to resolve an incoming-call
 * action button. Action buttons on the full-screen call notification carry
 * `pressAction.id` of `"answer"` / `"decline"`; a plain tap carries the
 * notification's own press action id instead.
 */
type NotificationPressEvent = {
  type: number;
  detail?: {
    notification?: {
      data?: Record<string, unknown> | null;
      title?: string | null;
      body?: string | null;
    } | null;
    pressAction?: { id?: string | null } | null;
  } | null;
};

function resolveCallActionId(
  event: NotificationPressEvent
): "answer" | "decline" | null {
  const id = event.detail?.pressAction?.id;
  if (id === "answer" || id === "decline") {
    return id;
  }
  return null;
}

export function initializeNotificationCenter(options: {
  onOpenPayload: (payload: MobileNotificationPayload) => Promise<void> | void;
  onForegroundPayload?: (
    payload: MobileNotificationPayload
  ) => Promise<void> | void;
  onPushRegistration: (
    registration: MobilePushRegistration
  ) => Promise<void> | void;
}) {
  const cleanups: Array<() => void> = [];
  const { client, EventType } = getNotifeeRuntime();

  // iOS：卸载重装后沙盒固定铃声文件可能已丢失，启动时校验并在缺失时回退系统默认。
  void runIosToneFallbackCheck();

  cleanups.push(
    initializeUnifiedPush({
      onRegistration: options.onPushRegistration,
      onForegroundMessage: async message => {
        const payload = parseRemoteNotificationPayload(message);
        if (!payload) {
          return;
        }

        await options.onForegroundPayload?.(payload);
        if (payload.type === "chat.message") {
          const context = await buildPushDisplayContext(payload, "active");
          await displayLocalNotification(payload, context);
        }
        // Incoming-call push (Android): surface the accept/decline call
        // notification regardless of foreground state. Foreground calls are
        // also handled by the WS `call.invited` branch — the fixed callId
        // notification id makes the duplicate a no-op (same notification
        // updated), and `reportIncomingSystemCall` dedupes the system call.
        if (payload.type === "call.invite" && Platform.OS === "android") {
          await displayIncomingCallNotification(payload);
          await reportIncomingSystemCall(payload);
        }
        // The peer hung up / timed out: tear down the incoming-call
        // notification + system call immediately, so the stale
        // accept/decline notification does not linger into the next app
        // foreground. Mirrors the background handler in `index.js`.
        if (payload.type === "call.missed" && payload.callId) {
          await clearIncomingCallNotification(payload.callId);
          await endSystemCall(payload.callId);
        }
      },
      onNotificationOpened: message => {
        const payload = parseRemoteNotificationPayload(message);
        if (!payload) {
          return;
        }

        notifyLog.info("notification opened (push)", {
          type: payload.type,
          hasCallId: Boolean(payload.callId),
          hasConversation: Boolean(payload.conversationId)
        });
        persistPendingNotificationOpen(payload);
        void options.onOpenPayload(payload);
      }
    })
  );

  if (client?.onForegroundEvent) {
    cleanups.push(
      client.onForegroundEvent((event: NotificationPressEvent) => {
        if (event.type !== (EventType?.PRESS ?? 1)) {
          return;
        }

        const callAction = resolveCallActionId(event);
        if (callAction) {
          const payload = parseNotificationPayload(
            event.detail?.notification?.data,
            {
              title: event.detail?.notification?.title,
              body: event.detail?.notification?.body
            }
          );
          if (payload?.callId) {
            notifyLog.info("call notification action (foreground)", {
              action: callAction,
              callId: payload.callId
            });
            handleNotificationCallAction(callAction, payload.callId);
          }
          return;
        }

        const payload = parseNotificationPayload(
          event.detail?.notification?.data,
          {
            title: event.detail?.notification?.title,
            body: event.detail?.notification?.body
          }
        );
        if (!payload) {
          return;
        }

        notifyLog.info("notification opened (foreground tap)", {
          type: payload.type
        });
        persistPendingNotificationOpen(payload);
        void options.onOpenPayload(payload);
      })
    );
  }

  const initialLocalNotification = client?.getInitialNotification?.();
  void initialLocalNotification?.then(
    (
      detail:
        | {
            notification?: {
              data?: Record<string, unknown> | null;
              title?: string | null;
              body?: string | null;
            } | null;
          }
        | null
        | undefined
    ) => {
      const payload = parseNotificationPayload(detail?.notification?.data, {
        title: detail?.notification?.title,
        body: detail?.notification?.body
      });
      if (!payload) {
        return;
      }

      notifyLog.info("notification cold open", { type: payload.type });
      persistPendingNotificationOpen(payload);
      void options.onOpenPayload(payload);
    }
  );

  return () => {
    for (const cleanup of cleanups) {
      cleanup();
    }
  };
}

export function registerNotificationBackgroundHandlers(options: {
  onBackgroundPayload: (
    payload: MobileNotificationPayload
  ) => Promise<void> | void;
}) {
  if (backgroundHandlersRegistered) {
    return;
  }
  backgroundHandlersRegistered = true;

  const { client, EventType } = getNotifeeRuntime();

  registerUnifiedPushBackgroundHandler(async message => {
    const payload = parseRemoteNotificationPayload(message);
    if (!payload) {
      return;
    }

    notifyLog.info("bg push", { type: payload.type });
    await options.onBackgroundPayload(payload);
    // Android background fallback: refresh the OS app-icon badge from the
    // server-provided total. iOS sets the badge natively via APNs
    // `aps.badge`, so this is primarily for Android where JS handles it.
    if (typeof payload.badge === "number") {
      await setAppBadgeCount(payload.badge);
    }
    if (payload.type === "chat.message") {
      const context = await buildPushDisplayContext(payload, "background");
      await displayLocalNotification(payload, context);
    }
  });

  client?.onBackgroundEvent?.(async (event: NotificationPressEvent) => {
    if (event.type !== (EventType?.PRESS ?? 1)) {
      return;
    }

    const callAction = resolveCallActionId(event);
    if (callAction) {
      const payload = parseNotificationPayload(
        event.detail?.notification?.data,
        {
          title: event.detail?.notification?.title,
          body: event.detail?.notification?.body
        }
      );
      if (payload?.callId) {
        notifyLog.info("call notification action (background)", {
          action: callAction,
          callId: payload.callId
        });
        handleNotificationCallAction(callAction, payload.callId);
      }
      return;
    }

    const payload = parseNotificationPayload(event.detail?.notification?.data, {
      title: event.detail?.notification?.title,
      body: event.detail?.notification?.body
    });
    if (!payload) {
      return;
    }

    persistPendingNotificationOpen(payload);
  });
}
