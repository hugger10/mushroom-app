import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const notificationSettingsRepositoryModule = require("../dist/server/src/repository/notification_settings_repository.js");
const notificationSettingsServiceModule = require("../dist/server/src/service/notification_settings_service.js");

const NotificationSettingsRepository =
  notificationSettingsRepositoryModule.default;
const NotificationSettingsService = notificationSettingsServiceModule.default;

const originalFindByUserId = NotificationSettingsRepository.findByUserId;
const originalUpdate = NotificationSettingsRepository.update;

const baseRecord = {
  user_id: 1001,
  messages_enabled: true,
  calls_enabled: true,
  group_messages_enabled: true,
  mention_only: false,
  in_app_banner_enabled: true,
  preview_mode: "full",
  quiet_hours_enabled: false,
  quiet_hours_start: "22:00",
  quiet_hours_end: "08:00",
  quiet_hours_allow_mentions: true,
  quiet_hours_allow_calls: true,
  sound_enabled: true,
  updated_at: new Date("2026-03-29T12:00:00.000Z")
};

test.afterEach(() => {
  NotificationSettingsRepository.findByUserId = originalFindByUserId;
  NotificationSettingsRepository.update = originalUpdate;
});

test("getNotificationSettings maps repository record to API model", async () => {
  NotificationSettingsRepository.findByUserId = async userId => ({
    ...baseRecord,
    user_id: userId,
    preview_mode: "sender",
    quiet_hours_enabled: true
  });

  const settings =
    await NotificationSettingsService.getNotificationSettings(1002);

  assert.deepEqual(settings, {
    messages_enabled: true,
    calls_enabled: true,
    group_messages_enabled: true,
    mention_only: false,
    in_app_banner_enabled: true,
    preview_mode: "sender",
    quiet_hours_enabled: true,
    quiet_hours_start: "22:00",
    quiet_hours_end: "08:00",
    quiet_hours_allow_mentions: true,
    quiet_hours_allow_calls: true,
    sound_enabled: true
  });
});

test("updateNotificationSettings validates preview mode and quiet hour format", async () => {
  await assert.rejects(
    () =>
      NotificationSettingsService.updateNotificationSettings(1001, {
        preview_mode: "compact"
      }),
    /preview_mode is invalid/
  );

  await assert.rejects(
    () =>
      NotificationSettingsService.updateNotificationSettings(1001, {
        quiet_hours_start: "25:00"
      }),
    /HH:mm format/
  );

  await assert.rejects(
    () =>
      NotificationSettingsService.updateNotificationSettings(1001, {
        sound_enabled: "yes"
      }),
    /sound_enabled|boolean/
  );
});

test("updateNotificationSettings persists valid patch and returns normalized settings", async () => {
  let capturedUserId = 0;
  let capturedPatch = null;

  NotificationSettingsRepository.update = async (userId, patch) => {
    capturedUserId = userId;
    capturedPatch = patch;
    return {
      ...baseRecord,
      user_id: userId,
      messages_enabled: false,
      preview_mode: patch.preview_mode ?? baseRecord.preview_mode
    };
  };

  const settings = await NotificationSettingsService.updateNotificationSettings(
    1001,
    {
      messages_enabled: false,
      preview_mode: "hidden"
    }
  );

  assert.equal(capturedUserId, 1001);
  assert.deepEqual(capturedPatch, {
    messages_enabled: false,
    preview_mode: "hidden"
  });
  assert.equal(settings.messages_enabled, false);
  assert.equal(settings.preview_mode, "hidden");
});
