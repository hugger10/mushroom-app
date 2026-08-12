/**
 * Android notification channel setup. iOS is a no-op because Notifee
 * channels are an Android-only concept.
 */

import { Platform } from "react-native";
import { readNotificationPreferences } from "../notification-preferences";
import {
  getMessagesChannelId,
  messageSoundToAndroidSound,
  MESSAGES_CHANNEL_ID_PREFIX
} from "../alert-tones/types";
import { getNotifeeRuntime, notifyLog } from "./runtime";
import { CALLS_CHANNEL_ID } from "./types";
import { i18n } from "../../i18n";

let channelsReady = false;

/**
 * 铃声切换后由 `selectTone` 调用：清掉内存守卫，使下一次
 * `ensureNotificationChannels` 按新偏好重建版本化渠道。
 */
export function resetNotificationChannels() {
  channelsReady = false;
}

export async function ensureNotificationChannels() {
  const { client, AndroidImportance, AndroidVisibility } = getNotifeeRuntime();
  if (!client || channelsReady || Platform.OS !== "android") {
    return;
  }

  channelsReady = true;
  notifyLog.info("create android channels");

  const { messageSound } = readNotificationPreferences();
  const messagesChannelId = getMessagesChannelId(messageSound);
  const messagesSound = messageSoundToAndroidSound(messageSound);

  // 清理其他铃声的旧版本化渠道，再按当前偏好重建。
  // 失败非致命：新安装无物可删，旧 id 不存在时同样优雅返回。
  if (client.deleteChannel) {
    await Promise.allSettled(
      (await listStaleVersionedChannelIds(messagesChannelId)).map(channelId =>
        client.deleteChannel!(channelId)
      )
    );
  }

  // 渠道创建失败不应阻断 push 注册与通知显示：allSettled 容错 + 失败告警。
  const results = await Promise.allSettled([
    client.createChannel?.({
      id: messagesChannelId,
      name: i18n.t("notifications.messagesChannel"),
      description: i18n.t("notifications.messagesChannelDesc"),
      // HIGH (4) is required for Android heads-up banners. DEFAULT (3)
      // silently drops the notification into the shade with no peek.
      importance: AndroidImportance?.HIGH ?? 4,
      lights: true,
      vibration: true,
      // Notifee 校验要求 vibrationPattern 全为正数（首元素不允许 0），
      // 用 1ms 前导近似 Android 的"立即振动"语义。
      vibrationPattern: [1, 200, 100, 120],
      ...(messagesSound === undefined
        ? {}
        : {
            sound: messagesSound
          })
    }),
    client.createChannel?.({
      id: CALLS_CHANNEL_ID,
      name: i18n.t("notifications.callsChannel"),
      description: i18n.t("notifications.callsChannelDesc"),
      // MAX/HIGH importance + public lockscreen visibility + DND bypass so an
      // incoming call can fire a full-screen intent and ring on the lock
      // screen even under Do-Not-Disturb, mirroring system telephony.
      importance: AndroidImportance?.HIGH ?? 4,
      visibility: AndroidVisibility?.PUBLIC ?? 1,
      bypassDnd: true,
      lights: true,
      vibration: true,
      vibrationPattern: [1, 400, 200, 400],
      sound: "incoming_ring"
    })
  ]);
  const failedResults = results.filter(result => result.status === "rejected");
  if (failedResults.length > 0) {
    notifyLog.warn("create android channels failed", {
      count: failedResults.length,
      errors: failedResults.map(
        result => (result as PromiseRejectedResult).reason?.message
      )
    });
    channelsReady = false;
  }
}

/**
 * 枚举除当前版本外所有 `mushroom-messages-{hash}` 版本化渠道。
 * 依赖 notifee 的 `getChannels` 能力；不可用时返回空数组（退化：仅清旧版常量）。
 */
async function listStaleVersionedChannelIds(currentId: string) {
  const { client } = getNotifeeRuntime();
  if (!client?.getChannels) {
    return [] as string[];
  }
  try {
    const channels = await client.getChannels();
    return channels
      .filter(
        channel =>
          channel.id.startsWith(`${MESSAGES_CHANNEL_ID_PREFIX}-`) &&
          channel.id !== currentId
      )
      .map(channel => channel.id);
  } catch {
    return [] as string[];
  }
}
