import type {
  UpdateUserNotificationSettingsRequest,
  UserNotificationSettings
} from "@mushroom/shared";
import { BusinessError } from "../handler/business_error";
import NotificationSettingsRepository from "../repository/notification_settings_repository";
import type { UserNotificationSettingsRecord } from "../repository/models";

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/u;

function mapNotificationSettings(
  record: UserNotificationSettingsRecord
): UserNotificationSettings {
  return {
    messages_enabled: record.messages_enabled,
    calls_enabled: record.calls_enabled,
    sound_enabled: record.sound_enabled,
    group_messages_enabled: record.group_messages_enabled,
    mention_only: record.mention_only,
    in_app_banner_enabled: record.in_app_banner_enabled,
    preview_mode: record.preview_mode,
    quiet_hours_enabled: record.quiet_hours_enabled,
    quiet_hours_start: record.quiet_hours_start,
    quiet_hours_end: record.quiet_hours_end,
    quiet_hours_allow_mentions: record.quiet_hours_allow_mentions,
    quiet_hours_allow_calls: record.quiet_hours_allow_calls
  };
}

function validateBoolean(value: unknown) {
  return value === undefined || typeof value === "boolean";
}

function validatePreviewMode(value: unknown) {
  return (
    value === undefined ||
    value === "full" ||
    value === "sender" ||
    value === "hidden"
  );
}

function validateTime(value: unknown) {
  return (
    value === undefined ||
    (typeof value === "string" && timePattern.test(value))
  );
}

class NotificationSettingsService {
  async getNotificationSettings(
    userId: number
  ): Promise<UserNotificationSettings> {
    return mapNotificationSettings(
      await NotificationSettingsRepository.findByUserId(userId)
    );
  }

  async updateNotificationSettings(
    userId: number,
    patch: UpdateUserNotificationSettingsRequest
  ): Promise<UserNotificationSettings> {
    if (
      !validateBoolean(patch.messages_enabled) ||
      !validateBoolean(patch.calls_enabled) ||
      !validateBoolean(patch.sound_enabled) ||
      !validateBoolean(patch.group_messages_enabled) ||
      !validateBoolean(patch.mention_only) ||
      !validateBoolean(patch.in_app_banner_enabled) ||
      !validateBoolean(patch.quiet_hours_enabled) ||
      !validateBoolean(patch.quiet_hours_allow_mentions) ||
      !validateBoolean(patch.quiet_hours_allow_calls)
    ) {
      throw new BusinessError("Notification boolean settings must be boolean");
    }

    if (!validatePreviewMode(patch.preview_mode)) {
      throw new BusinessError("Notification preview_mode is invalid");
    }

    if (
      !validateTime(patch.quiet_hours_start) ||
      !validateTime(patch.quiet_hours_end)
    ) {
      throw new BusinessError("Notification quiet hours must use HH:mm format");
    }

    return mapNotificationSettings(
      await NotificationSettingsRepository.update(userId, patch)
    );
  }
}

export default new NotificationSettingsService();
