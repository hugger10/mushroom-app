/**
 * Chat-message notification presentation. Two entry points:
 *   - {@link displayLocalNotification} is the low-level dispatcher used by
 *     the push handlers and other transport-aware call sites.
 *   - {@link displayChatMessageNotification} is the high-level WS-path
 *     entry point that consumes rich call-site context (active
 *     conversation, mute flag, mention flag) before delegating.
 */

import { AndroidImportance } from "@notifee/react-native";
import {
  getMessagesChannelId,
  messageSoundToIosSound
} from "../alert-tones/types";
import { readNotificationPreferences } from "../notification-preferences";
import { ensureNotificationChannels } from "./channels";
import {
  chatNotificationDedup,
  getDisplayBody,
  shouldDisplayPayload
} from "./payload";
import { getNotifeeRuntime, notifyLog } from "./runtime";
import {
  CALLS_CHANNEL_ID,
  type MobileNotificationPayload,
  type NotificationDisplayContext
} from "./types";

export async function displayLocalNotification(
  payload: MobileNotificationPayload,
  context: NotificationDisplayContext = {}
) {
  const { client } = getNotifeeRuntime();
  if (!client) {
    notifyLog.warn("displayLocalNotification skipped: no notifee client");
    return;
  }
  if (!shouldDisplayPayload(payload, context)) {
    notifyLog.info("displayLocalNotification suppressed by policy", {
      type: payload.type,
      messageId: payload.messageId,
      appState: context.appState,
      isActiveConversation: context.isActiveConversation,
      isMuted: context.isMuted,
      isMentioned: payload.isMentioned,
      isGroup: payload.isGroup
    });
    return;
  }

  if (
    payload.type === "chat.message" &&
    !chatNotificationDedup.reserve(payload.messageId)
  ) {
    notifyLog.info("chat notification deduped", {
      messageId: payload.messageId
    });
    return;
  }
  // A3: dedup keys against `messageId`. The server contract guarantees
  // `data.message_id` is set on every chat.message push (see
  // server/src/push). If we ever see it missing in the wild the dedup
  // window degrades to "first one wins" which is acceptable but worth
  // surfacing in logs so we notice envelope regressions.
  if (payload.type === "chat.message" && !payload.messageId) {
    notifyLog.warn("chat notification missing messageId; dedup degraded", {
      conversationId: payload.conversationId
    });
  }
  await ensureNotificationChannels();
  const body = getDisplayBody(payload);
  const isCallInvite = payload.type === "call.invite";
  const messageSound = readNotificationPreferences().messageSound;
  const messagesChannelId = getMessagesChannelId(messageSound);
  const iosSound = isCallInvite
    ? "incoming_ring.wav"
    : messageSoundToIosSound(messageSound);
  const data = Object.entries({
    type: payload.type,
    title: payload.title,
    body,
    conversation_id: payload.conversationId,
    conversation_name: payload.conversationName,
    message_id: payload.messageId,
    call_id: payload.callId,
    call_scope:
      payload.callScope !== undefined ? String(payload.callScope) : undefined,
    media_type:
      payload.mediaType !== undefined ? String(payload.mediaType) : undefined,
    sender_user_id:
      payload.senderUserId !== undefined
        ? String(payload.senderUserId)
        : undefined,
    sender_device_id: payload.senderDeviceId,
    timeout_seconds:
      payload.timeoutSeconds !== undefined
        ? String(payload.timeoutSeconds)
        : undefined
  }).reduce<Record<string, string>>((accumulator, [key, value]) => {
    if (typeof value === "string") {
      accumulator[key] = value;
    }
    return accumulator;
  }, {});

  try {
    await client.displayNotification?.({
      title: payload.title,
      body,
      data,
      android: {
        channelId: isCallInvite ? CALLS_CHANNEL_ID : messagesChannelId,
        pressAction: {
          id: "default"
        },
        smallIcon: "ic_launcher",
        // Both call.invite and chat.message want a heads-up peek; the
        // channel itself is HIGH, so this just matches.
        importance: AndroidImportance?.HIGH ?? 4
      },
      ios: {
        // `messageSoundToIosSound` 返回 null 表示静音（省略 ios.sound）。
        ...(iosSound === null ? {} : { sound: iosSound }),
        categoryId: isCallInvite ? "MUSHROOM_CALL" : "MUSHROOM_MESSAGE"
      }
    });
  } catch (error) {
    // displayNotification failed (e.g. channel revoked, OS error). Release
    // the dedup slot so a retry from the alternate transport (push vs WS)
    // can still surface the message instead of being silently dropped.
    if (payload.type === "chat.message") {
      chatNotificationDedup.release(payload.messageId);
    }
    notifyLog.warn("displayNotification failed", {
      type: payload.type,
      messageId: payload.messageId,
      error: (error as Error)?.message
    });
    throw error;
  }
  notifyLog.info("displayed notification", {
    type: payload.type,
    messageId: payload.messageId,
    channel: isCallInvite ? CALLS_CHANNEL_ID : messagesChannelId
  });
}

/**
 * High-level entry point used by the realtime (WS) path to surface a
 * heads-up / system notification for an incoming chat message.
 *
 * Distinct from {@link displayLocalNotification} in that it knows the
 * call site already has rich context (active conversation id, app
 * foreground state, server mute flag, mention flag) — exactly the
 * suppression inputs the desktop / web equivalent
 * (`useChatNotifications.showIncomingNotification`) consumes.
 *
 * Goals:
 * - Foreground + non-active conversation → banner (WhatsApp/Telegram parity).
 * - Foreground + active conversation → suppress.
 * - Muted conversation → suppress unless @-mention.
 * - In-app banner preference off → suppress while foregrounded.
 * - Dedup against any FCM/HMS push for the same `messageId`.
 */
export async function displayChatMessageNotification(input: {
  conversationId?: string;
  conversationName?: string;
  messageId?: string;
  senderUserId?: number;
  senderName?: string;
  body: string;
  isMentioned?: boolean;
  isGroup?: boolean;
  context: NotificationDisplayContext;
}) {
  const title = (() => {
    if (input.isGroup && input.conversationName) {
      return input.senderName
        ? `${input.senderName} @ ${input.conversationName}`
        : input.conversationName;
    }
    return input.senderName || input.conversationName || "Mushroom";
  })();

  const payload: MobileNotificationPayload = {
    type: "chat.message",
    title,
    body: input.body,
    conversationId: input.conversationId,
    conversationName: input.conversationName,
    messageId: input.messageId,
    senderUserId: input.senderUserId,
    isMentioned: input.isMentioned,
    isGroup: input.isGroup
  };

  await displayLocalNotification(payload, input.context);
}
