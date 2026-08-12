import type {
  UpdateUserNotificationSettingsRequest,
  UserNotificationSettings
} from "@mushroom/shared";
import { deviceStorage } from "../data/storage";
import {
  normalizeMessageSound,
  normalizeMessageSoundLabel,
  type MessageSound
} from "./alert-tones/types";

const NOTIFICATION_PREFERENCES_KEY = "mushroom.mobile.notification-preferences";

export type NotificationPreviewMode = "full" | "sender" | "hidden";

export type MobileNotificationPreferences = {
  messagesEnabled: boolean;
  callsEnabled: boolean;
  groupMessagesEnabled: boolean;
  mentionOnly: boolean;
  inAppBannerEnabled: boolean;
  previewMode: NotificationPreviewMode;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  quietHoursAllowMentions: boolean;
  quietHoursAllowCalls: boolean;
  /**
   * 消息铃声偏好。缺省/null = 系统默认。
   * 取值：null | "silent" | "message" | "fade" | "system:<iOS名>" | "content://...(Android URI)"
   * 仅本地存储，不参与服务端同步（fromServer/toServerPatch 剥离）。
   */
  messageSound: MessageSound;
  /** 仅 Android 自定义铃声使用：系统选择器返回的标题；iOS/内置由 id 推导显示名。 */
  messageSoundLabel?: string;
};

export const defaultNotificationPreferences: MobileNotificationPreferences = {
  messagesEnabled: true,
  callsEnabled: true,
  groupMessagesEnabled: true,
  mentionOnly: false,
  inAppBannerEnabled: true,
  previewMode: "full",
  quietHoursEnabled: false,
  quietHoursStart: "22:00",
  quietHoursEnd: "08:00",
  quietHoursAllowMentions: true,
  quietHoursAllowCalls: true,
  messageSound: null
};

function normalizeBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeTime(value: unknown, fallback: string) {
  if (typeof value !== "string") {
    return fallback;
  }

  return /^\d{2}:\d{2}$/u.test(value) ? value : fallback;
}

function normalizePreviewMode(value: unknown): NotificationPreviewMode {
  return value === "sender" || value === "hidden" || value === "full"
    ? value
    : defaultNotificationPreferences.previewMode;
}

export function normalizeNotificationPreferences(
  value: unknown
): MobileNotificationPreferences {
  const source =
    value && typeof value === "object"
      ? (value as Partial<MobileNotificationPreferences>)
      : {};

  return {
    messagesEnabled: normalizeBoolean(
      source.messagesEnabled,
      defaultNotificationPreferences.messagesEnabled
    ),
    callsEnabled: normalizeBoolean(
      source.callsEnabled,
      defaultNotificationPreferences.callsEnabled
    ),
    groupMessagesEnabled: normalizeBoolean(
      source.groupMessagesEnabled,
      defaultNotificationPreferences.groupMessagesEnabled
    ),
    mentionOnly: normalizeBoolean(
      source.mentionOnly,
      defaultNotificationPreferences.mentionOnly
    ),
    inAppBannerEnabled: normalizeBoolean(
      source.inAppBannerEnabled,
      defaultNotificationPreferences.inAppBannerEnabled
    ),
    previewMode: normalizePreviewMode(source.previewMode),
    quietHoursEnabled: normalizeBoolean(
      source.quietHoursEnabled,
      defaultNotificationPreferences.quietHoursEnabled
    ),
    quietHoursStart: normalizeTime(
      source.quietHoursStart,
      defaultNotificationPreferences.quietHoursStart
    ),
    quietHoursEnd: normalizeTime(
      source.quietHoursEnd,
      defaultNotificationPreferences.quietHoursEnd
    ),
    quietHoursAllowMentions: normalizeBoolean(
      source.quietHoursAllowMentions,
      defaultNotificationPreferences.quietHoursAllowMentions
    ),
    quietHoursAllowCalls: normalizeBoolean(
      source.quietHoursAllowCalls,
      defaultNotificationPreferences.quietHoursAllowCalls
    ),
    messageSound: normalizeMessageSound(source.messageSound),
    messageSoundLabel: normalizeMessageSoundLabel(
      normalizeMessageSound(source.messageSound),
      source.messageSoundLabel
    )
  };
}

export function readNotificationPreferences() {
  const raw = deviceStorage.getString(NOTIFICATION_PREFERENCES_KEY);
  if (!raw) {
    return defaultNotificationPreferences;
  }

  try {
    return normalizeNotificationPreferences(JSON.parse(raw));
  } catch {
    return defaultNotificationPreferences;
  }
}

export function saveNotificationPreferences(
  preferences: MobileNotificationPreferences
) {
  const normalized = normalizeNotificationPreferences(preferences);
  deviceStorage.set(NOTIFICATION_PREFERENCES_KEY, JSON.stringify(normalized));
  return normalized;
}

export function updateNotificationPreferences(
  patch: Partial<MobileNotificationPreferences>
) {
  return saveNotificationPreferences({
    ...readNotificationPreferences(),
    ...patch
  });
}

export function fromServerNotificationSettings(
  settings: UserNotificationSettings
): MobileNotificationPreferences {
  // 铃声偏好仅本地存储：从服务端恢复时保留本地 `messageSound` / `messageSoundLabel`，
  // 避免每次同步把铃声偏好重置为系统默认。
  const local = readNotificationPreferences();
  return normalizeNotificationPreferences({
    messagesEnabled: settings.messages_enabled,
    callsEnabled: settings.calls_enabled,
    groupMessagesEnabled: settings.group_messages_enabled,
    mentionOnly: settings.mention_only,
    inAppBannerEnabled: settings.in_app_banner_enabled,
    previewMode: settings.preview_mode,
    quietHoursEnabled: settings.quiet_hours_enabled,
    quietHoursStart: settings.quiet_hours_start,
    quietHoursEnd: settings.quiet_hours_end,
    quietHoursAllowMentions: settings.quiet_hours_allow_mentions,
    quietHoursAllowCalls: settings.quiet_hours_allow_calls,
    messageSound: local.messageSound,
    messageSoundLabel: local.messageSoundLabel
  });
}

export function toServerNotificationSettingsPatch(
  patch: Partial<MobileNotificationPreferences>
): UpdateUserNotificationSettingsRequest {
  return {
    ...(patch.messagesEnabled === undefined
      ? {}
      : { messages_enabled: patch.messagesEnabled }),
    ...(patch.callsEnabled === undefined
      ? {}
      : { calls_enabled: patch.callsEnabled }),
    ...(patch.groupMessagesEnabled === undefined
      ? {}
      : { group_messages_enabled: patch.groupMessagesEnabled }),
    ...(patch.mentionOnly === undefined
      ? {}
      : { mention_only: patch.mentionOnly }),
    ...(patch.inAppBannerEnabled === undefined
      ? {}
      : { in_app_banner_enabled: patch.inAppBannerEnabled }),
    ...(patch.previewMode === undefined
      ? {}
      : { preview_mode: patch.previewMode }),
    ...(patch.quietHoursEnabled === undefined
      ? {}
      : { quiet_hours_enabled: patch.quietHoursEnabled }),
    ...(patch.quietHoursStart === undefined
      ? {}
      : { quiet_hours_start: patch.quietHoursStart }),
    ...(patch.quietHoursEnd === undefined
      ? {}
      : { quiet_hours_end: patch.quietHoursEnd }),
    ...(patch.quietHoursAllowMentions === undefined
      ? {}
      : { quiet_hours_allow_mentions: patch.quietHoursAllowMentions }),
    ...(patch.quietHoursAllowCalls === undefined
      ? {}
      : { quiet_hours_allow_calls: patch.quietHoursAllowCalls })
  };
}
