/**
 * Incoming-call notification presentation. Distinct from chat-message
 * notifications because:
 *   - call invites are stable-id'd so we can later cancel them on
 *     accept/decline/timeout;
 *   - they pin to the calls channel (separate sound / vibration);
 *   - they are marked `ongoing` + `loopSound` to mimic system-call UX.
 */

import { AndroidImportance, AndroidCategory } from "@notifee/react-native";
import { ensureNotificationChannels } from "./channels";
import { shouldDisplayPayload } from "./payload";
import { getNotifeeRuntime, notifyLog } from "./runtime";
import {
  CALL_INVITE_NOTIFICATION_PREFIX,
  CALLS_CHANNEL_ID,
  type MobileNotificationPayload
} from "./types";
import { i18n } from "../../i18n";

const activeIncomingCallNotificationIds = new Set<string>();

function buildIncomingCallNotificationId(callId: string) {
  return `${CALL_INVITE_NOTIFICATION_PREFIX}${callId}`;
}

export async function displayIncomingCallNotification(
  payload: MobileNotificationPayload
) {
  const { client } = getNotifeeRuntime();
  if (
    !client ||
    payload.type !== "call.invite" ||
    !payload.callId ||
    !shouldDisplayPayload(payload)
  ) {
    return;
  }

  notifyLog.info("displayIncomingCall", { callId: payload.callId });
  await ensureNotificationChannels();
  const notificationId = buildIncomingCallNotificationId(payload.callId);
  activeIncomingCallNotificationIds.add(notificationId);

  await client.displayNotification?.({
    id: notificationId,
    title: payload.title,
    body: payload.body,
    data: {
      type: payload.type,
      title: payload.title,
      body: payload.body,
      call_id: payload.callId,
      conversation_id: payload.conversationId ?? "",
      conversation_name: payload.conversationName ?? "",
      call_scope:
        payload.callScope !== undefined ? String(payload.callScope) : "",
      media_type:
        payload.mediaType !== undefined ? String(payload.mediaType) : "",
      sender_user_id:
        payload.senderUserId !== undefined ? String(payload.senderUserId) : "",
      sender_device_id: payload.senderDeviceId ?? "",
      timeout_seconds:
        payload.timeoutSeconds !== undefined
          ? String(payload.timeoutSeconds)
          : ""
    },
    android: {
      channelId: CALLS_CHANNEL_ID,
      pressAction: {
        id: "default"
      },
      // Full-screen intent turns the heads-up call notification into a true
      // incoming-call screen that launches over the lock screen even when the
      // app is backgrounded/killed (requires USE_FULL_SCREEN_INTENT, which the
      // manifest already declares). This is the Android equivalent of iOS
      // CallKit and matches WhatsApp/Telegram behaviour.
      fullScreenAction: {
        id: "default"
      },
      // Android renders no native caller UI (CallKeep is not used), so the
      // accept/decline controls live on the full-screen notification itself.
      // `launchActivity` brings the app (MainActivity) back to the foreground
      // when a button is tapped — required for the killed/background answer to
      // open the app and replay the pending action. Pressing them routes
      // through `handleNotificationCallAction` (see `notifications/lifecycle.ts`).
      actions: [
        {
          title: i18n.t("ui.callOverlay.accept"),
          pressAction: {
            id: "answer",
            launchActivity: "default"
          }
        },
        {
          title: i18n.t("ui.callOverlay.reject"),
          pressAction: {
            id: "decline",
            launchActivity: "default"
          }
        }
      ],
      category: AndroidCategory?.CALL ?? "call",
      smallIcon: "ic_launcher",
      importance: AndroidImportance?.HIGH ?? 4,
      ongoing: true,
      loopSound: true,
      onlyAlertOnce: false
    },
    ios: {
      sound: "incoming_ring.wav",
      categoryId: "MUSHROOM_CALL"
    }
  });
}

export async function clearIncomingCallNotification(callId?: string) {
  const { client } = getNotifeeRuntime();
  if (!client) {
    return;
  }

  const targetIds = callId
    ? [buildIncomingCallNotificationId(callId)]
    : Array.from(activeIncomingCallNotificationIds);
  if (targetIds.length > 0) {
    notifyLog.info("clearIncomingCall", {
      callId: callId ?? null,
      count: targetIds.length
    });
  }

  await Promise.all(
    targetIds.map(async notificationId => {
      activeIncomingCallNotificationIds.delete(notificationId);
      await Promise.allSettled([
        client.cancelDisplayedNotification?.(notificationId),
        client.cancelNotification?.(notificationId)
      ]);
    })
  );
}
