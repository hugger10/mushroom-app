import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const configModule = require("../dist/server/src/utils/config.js");
const notificationSettingsServiceModule = require("../dist/server/src/service/notification_settings_service.js");
const pushRouterModule = require("../dist/server/src/service/push/push_router.js");
const userDeviceRepositoryModule = require("../dist/server/src/repository/user_device_repository.js");
const fcmPushProviderModule = require("../dist/server/src/service/push/fcm_push_provider.js");
const apnsVoipPushProviderModule = require("../dist/server/src/service/push/apns_voip_push_provider.js");
const conversationReadStateRepositoryModule = require("../dist/server/src/repository/conversation/conversation_read_state_repository.js");

const { config } = configModule;
const NotificationSettingsService = notificationSettingsServiceModule.default;
const PushRouter = pushRouterModule.default;
const UserDeviceRepository = userDeviceRepositoryModule.default;
const FcmPushProvider = fcmPushProviderModule.default;
const ApnsVoipPushProvider = apnsVoipPushProviderModule.default;
const ConversationReadStateRepository =
  conversationReadStateRepositoryModule.default;

const originalPushEnabled = config.push.enabled;
const originalPushDryRun = config.push.dryRun;
const originalGetNotificationSettings =
  NotificationSettingsService.getNotificationSettings;
const originalListByUser = UserDeviceRepository.listByUser;
const originalDeliverToDevice = FcmPushProvider.deliverToDevice;
const originalIsConfigured = FcmPushProvider.isConfigured;
const originalVoipDeliverToDevice = ApnsVoipPushProvider.deliverToDevice;
const originalVoipIsConfigured = ApnsVoipPushProvider.isConfigured;
// Captured for symmetry; tests reset to a lightweight stub rather than the
// DB-backed original so they never touch a real database.
const _originalGetTotalUnreadForUser =
  ConversationReadStateRepository.getTotalUnreadForUser;
void _originalGetTotalUnreadForUser;

// Default stub so chat/missed-call pushes do not hit a real DB when the
// individual test does not care about the badge value.
ConversationReadStateRepository.getTotalUnreadForUser = async () => 0;

function settings(overrides = {}) {
  return {
    messages_enabled: true,
    calls_enabled: true,
    sound_enabled: true,
    group_messages_enabled: true,
    mention_only: false,
    in_app_banner_enabled: true,
    preview_mode: "full",
    quiet_hours_enabled: false,
    quiet_hours_start: "22:00",
    quiet_hours_end: "08:00",
    quiet_hours_allow_mentions: true,
    quiet_hours_allow_calls: true,
    ...overrides
  };
}

function fcmDevice(overrides = {}) {
  return {
    device_id: "device-1",
    push_provider: "fcm",
    push_token: "token-1",
    status: 1,
    ...overrides
  };
}

test.afterEach(() => {
  config.push.enabled = originalPushEnabled;
  config.push.dryRun = originalPushDryRun;
  NotificationSettingsService.getNotificationSettings =
    originalGetNotificationSettings;
  UserDeviceRepository.listByUser = originalListByUser;
  FcmPushProvider.deliverToDevice = originalDeliverToDevice;
  FcmPushProvider.isConfigured = originalIsConfigured;
  ApnsVoipPushProvider.deliverToDevice = originalVoipDeliverToDevice;
  ApnsVoipPushProvider.isConfigured = originalVoipIsConfigured;
  // Reset to the lightweight default stub (not the original DB-backed impl)
  // so subsequent chat/missed-call pushes never hit a real database.
  ConversationReadStateRepository.getTotalUnreadForUser = async () => 0;
});

test("deliverToUser suppresses chat push before loading target devices when messages are disabled", async () => {
  let deviceLookupCount = 0;

  config.push.enabled = true;
  NotificationSettingsService.getNotificationSettings = async () =>
    settings({ messages_enabled: false });
  UserDeviceRepository.listByUser = async () => {
    deviceLookupCount += 1;
    return [];
  };

  const result = await PushRouter.deliverToUser(1001, {
    type: "chat.message",
    title: "Alice",
    body: "hello",
    conversation_id: "conv-1",
    conversation_type: 1,
    message_id: "msg-1",
    is_mention: false
  });

  assert.deepEqual(result, {
    mode: "suppressed",
    targetedDevices: 0,
    delivered: 0
  });
  assert.equal(deviceLookupCount, 0);
});

test("deliverToUser allows mention-only group push when payload mentions the user", async () => {
  let deviceLookupCount = 0;

  config.push.enabled = true;
  NotificationSettingsService.getNotificationSettings = async () =>
    settings({ mention_only: true });
  UserDeviceRepository.listByUser = async () => {
    deviceLookupCount += 1;
    return [];
  };

  const result = await PushRouter.deliverToUser(1001, {
    type: "chat.message",
    title: "Alice · Group",
    body: "@Bob hello",
    conversation_id: "conv-1",
    conversation_type: 2,
    message_id: "msg-1",
    is_mention: true
  });

  assert.equal(result.mode, "no-target");
  assert.equal(deviceLookupCount, 1);
});

test("deliverToUser keeps call push audible when sound is muted", async () => {
  let captured = null;

  config.push.enabled = true;
  config.push.dryRun = false;
  NotificationSettingsService.getNotificationSettings = async () =>
    settings({ sound_enabled: false });
  UserDeviceRepository.listByUser = async () => [fcmDevice()];
  FcmPushProvider.isConfigured = () => true;
  FcmPushProvider.deliverToDevice = async (_device, envelope) => {
    captured = envelope;
  };

  const result = await PushRouter.deliverToUser(1001, {
    type: "call.invite",
    title: "Alice",
    body: "Incoming call",
    conversation_id: "conv-1",
    conversation_type: 1,
    message_id: "call-1",
    is_mention: false
  });

  assert.equal(result.delivered, 1);
  assert.ok(captured, "expected envelope to be captured");
  assert.notEqual(captured.silent, true);
});

test("deliverToUser keeps call push audible during quiet hours when calls are allowed", async () => {
  let captured = null;
  const now = new Date();
  const beforeMinutes =
    (now.getHours() * 60 + now.getMinutes() + 24 * 60 - 30) % (24 * 60);
  const afterMinutes =
    (now.getHours() * 60 + now.getMinutes() + 30) % (24 * 60);
  const formatHM = total =>
    `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;

  config.push.enabled = true;
  config.push.dryRun = false;
  NotificationSettingsService.getNotificationSettings = async () =>
    settings({
      quiet_hours_enabled: true,
      quiet_hours_start: formatHM(beforeMinutes),
      quiet_hours_end: formatHM(afterMinutes),
      quiet_hours_allow_calls: true
    });
  UserDeviceRepository.listByUser = async () => [fcmDevice()];
  FcmPushProvider.isConfigured = () => true;
  FcmPushProvider.deliverToDevice = async (_device, envelope) => {
    captured = envelope;
  };

  const result = await PushRouter.deliverToUser(1001, {
    type: "call.invite",
    title: "Alice",
    body: "Incoming call",
    conversation_id: "conv-1",
    conversation_type: 1,
    message_id: "call-2",
    is_mention: false
  });

  assert.equal(result.delivered, 1);
  assert.ok(captured, "expected envelope to be captured");
  assert.notEqual(captured.silent, true);
});

test("buildMessage delivers chat.message as a data-only payload (no duplicate system notification)", () => {
  const body = FcmPushProvider.buildMessage("token-1", {
    type: "chat.message",
    title: "Alice",
    body: "hello",
    conversation_id: "conv-1",
    conversation_type: 1,
    message_id: "msg-1",
    is_mention: false
  });

  // No top-level notification block: FCM must not auto-display; the client
  // JS background handler (Notifee) is the single source of display.
  assert.equal(
    body.message.notification,
    undefined,
    "chat payload must not include a top-level notification block"
  );
  // No android.notification block either (would also trigger auto-display).
  assert.equal(
    body.message.android?.notification,
    undefined,
    "chat payload must not include an android.notification block"
  );
  // data-only messages need high priority to reliably wake the bg handler.
  assert.equal(body.message.android?.priority, "high");
  assert.ok(body.message.data, "chat payload must carry a data block");
});

test("buildMessage keeps call.invite data-only and high priority", () => {
  const body = FcmPushProvider.buildMessage("token-1", {
    type: "call.invite",
    title: "Alice",
    body: "Incoming call",
    conversation_id: "conv-1",
    conversation_type: 1,
    message_id: "call-1",
    is_mention: false
  });

  assert.equal(body.message.notification, undefined);
  assert.equal(body.message.android?.notification, undefined);
  assert.equal(body.message.android?.priority, "high");
  assert.equal(body.message.apns?.payload?.aps?.["content-available"], 1);
});

test("deliverToUser silences chat push when sound is muted", async () => {
  let captured = null;

  config.push.enabled = true;
  config.push.dryRun = false;
  NotificationSettingsService.getNotificationSettings = async () =>
    settings({ sound_enabled: false });
  UserDeviceRepository.listByUser = async () => [fcmDevice()];
  FcmPushProvider.isConfigured = () => true;
  FcmPushProvider.deliverToDevice = async (_device, envelope) => {
    captured = envelope;
  };

  const result = await PushRouter.deliverToUser(1001, {
    type: "chat.message",
    title: "Alice",
    body: "hello",
    conversation_id: "conv-1",
    conversation_type: 1,
    message_id: "msg-2",
    is_mention: false
  });

  assert.equal(result.delivered, 1);
  assert.ok(captured, "expected envelope to be captured");
  assert.equal(captured.silent, true);
});

test("deliverToUser attaches the recipient unread total as badge on chat push", async () => {
  let captured = null;

  config.push.enabled = true;
  config.push.dryRun = false;
  NotificationSettingsService.getNotificationSettings = async () => settings();
  UserDeviceRepository.listByUser = async () => [fcmDevice()];
  FcmPushProvider.isConfigured = () => true;
  FcmPushProvider.deliverToDevice = async (_device, envelope) => {
    captured = envelope;
  };
  ConversationReadStateRepository.getTotalUnreadForUser = async () => 7;

  const result = await PushRouter.deliverToUser(1001, {
    type: "chat.message",
    title: "Alice",
    body: "hello",
    conversation_id: "conv-1",
    conversation_type: 1,
    message_id: "msg-badge",
    is_mention: false
  });

  assert.equal(result.delivered, 1);
  assert.ok(captured, "expected envelope to be captured");
  assert.equal(captured.badge, 7);
});

test("deliverToUser does not attach a badge on call.invite", async () => {
  let captured = null;
  let unreadLookupCount = 0;

  config.push.enabled = true;
  config.push.dryRun = false;
  NotificationSettingsService.getNotificationSettings = async () => settings();
  UserDeviceRepository.listByUser = async () => [fcmDevice()];
  FcmPushProvider.isConfigured = () => true;
  FcmPushProvider.deliverToDevice = async (_device, envelope) => {
    captured = envelope;
  };
  ConversationReadStateRepository.getTotalUnreadForUser = async () => {
    unreadLookupCount += 1;
    return 3;
  };

  await PushRouter.deliverToUser(1001, {
    type: "call.invite",
    title: "Alice",
    body: "Incoming call",
    conversation_id: "conv-1",
    conversation_type: 1,
    message_id: "call-badge",
    is_mention: false
  });

  assert.ok(captured, "expected envelope to be captured");
  assert.equal(captured.badge, undefined);
  assert.equal(unreadLookupCount, 0);
});

test("buildMessage maps envelope badge to apns aps.badge for chat push", () => {
  const body = FcmPushProvider.buildMessage("token-1", {
    type: "chat.message",
    title: "Alice",
    body: "hello",
    conversation_id: "conv-1",
    conversation_type: 1,
    message_id: "msg-1",
    is_mention: false,
    badge: 12
  });

  assert.equal(body.message.apns?.payload?.aps?.badge, 12);
});

test("buildMessage omits aps.badge when envelope has no badge", () => {
  const body = FcmPushProvider.buildMessage("token-1", {
    type: "chat.message",
    title: "Alice",
    body: "hello",
    conversation_id: "conv-1",
    conversation_type: 1,
    message_id: "msg-1",
    is_mention: false
  });

  assert.equal(body.message.apns?.payload?.aps?.badge, undefined);
});

test("deliverToUser routes call.invite to apns_voip for a device with a voip_token (no duplicate FCM ring)", async () => {
  let voipCaptured = null;
  let fcmCalled = false;

  config.push.enabled = true;
  config.push.dryRun = false;
  NotificationSettingsService.getNotificationSettings = async () => settings();
  UserDeviceRepository.listByUser = async () => [
    fcmDevice({
      device_id: "ios-1",
      push_provider: "fcm",
      push_token: "fcm-token-ios",
      voip_token: "voip-token-1"
    })
  ];
  FcmPushProvider.isConfigured = () => true;
  FcmPushProvider.deliverToDevice = async () => {
    fcmCalled = true;
  };
  ApnsVoipPushProvider.isConfigured = () => true;
  ApnsVoipPushProvider.deliverToDevice = async (device, envelope) => {
    voipCaptured = { device, envelope };
  };

  const result = await PushRouter.deliverToUser(1001, {
    type: "call.invite",
    title: "Alice",
    body: "Incoming call",
    conversation_id: "conv-1",
    conversation_type: 1,
    message_id: "call-voip",
    is_mention: false
  });

  assert.equal(result.delivered, 1);
  assert.equal(result.targetedDevices, 1);
  assert.ok(voipCaptured, "expected VoIP provider to be invoked");
  assert.equal(voipCaptured.device.push_provider, "apns_voip");
  assert.equal(voipCaptured.device.voip_token, "voip-token-1");
  assert.equal(
    fcmCalled,
    false,
    "device with a voip_token must not also ring over FCM"
  );
});

test("deliverToUser falls back to FCM for a voip_token device when APNs VoIP is not configured", async () => {
  let voipCalled = false;
  let fcmCaptured = null;

  config.push.enabled = true;
  config.push.dryRun = false;
  NotificationSettingsService.getNotificationSettings = async () => settings();
  UserDeviceRepository.listByUser = async () => [
    fcmDevice({
      device_id: "ios-1",
      push_provider: "fcm",
      push_token: "fcm-token-ios",
      voip_token: "voip-token-1"
    })
  ];
  FcmPushProvider.isConfigured = () => true;
  FcmPushProvider.deliverToDevice = async (device, envelope) => {
    fcmCaptured = { device, envelope };
  };
  // APNs VoIP key missing/forgotten: the device must still ring via FCM.
  ApnsVoipPushProvider.isConfigured = () => false;
  ApnsVoipPushProvider.deliverToDevice = async () => {
    voipCalled = true;
  };

  const result = await PushRouter.deliverToUser(1001, {
    type: "call.invite",
    title: "Alice",
    body: "Incoming call",
    conversation_id: "conv-1",
    conversation_type: 1,
    message_id: "call-voip-unconfigured",
    is_mention: false
  });

  assert.equal(result.delivered, 1);
  assert.equal(result.targetedDevices, 1);
  assert.ok(
    fcmCaptured,
    "expected FCM fallback when APNs VoIP is not configured"
  );
  assert.equal(fcmCaptured.device.push_provider, "fcm");
  assert.equal(
    voipCalled,
    false,
    "VoIP provider must not be used when it is not configured"
  );
});

test("deliverToUser routes chat.message to FCM even when the device has a voip_token", async () => {
  let voipCalled = false;
  let fcmCaptured = null;

  config.push.enabled = true;
  config.push.dryRun = false;
  NotificationSettingsService.getNotificationSettings = async () => settings();
  UserDeviceRepository.listByUser = async () => [
    fcmDevice({
      device_id: "ios-1",
      push_provider: "fcm",
      push_token: "fcm-token-ios",
      voip_token: "voip-token-1"
    })
  ];
  FcmPushProvider.isConfigured = () => true;
  FcmPushProvider.deliverToDevice = async (device, envelope) => {
    fcmCaptured = { device, envelope };
  };
  ApnsVoipPushProvider.isConfigured = () => true;
  ApnsVoipPushProvider.deliverToDevice = async () => {
    voipCalled = true;
  };

  const result = await PushRouter.deliverToUser(1001, {
    type: "chat.message",
    title: "Alice",
    body: "hello",
    conversation_id: "conv-1",
    conversation_type: 1,
    message_id: "msg-voip-device",
    is_mention: false
  });

  assert.equal(result.delivered, 1);
  assert.ok(fcmCaptured, "expected FCM provider to be invoked for chat");
  assert.equal(fcmCaptured.device.push_provider, "fcm");
  assert.equal(
    voipCalled,
    false,
    "chat messages must never use the VoIP channel"
  );
});

test("buildPayload emits string-only call fields for the native PushKit handler", () => {
  const payload = ApnsVoipPushProvider.buildPayload({
    type: "call.invite",
    title: "Alice",
    body: "Incoming call",
    conversation_id: "conv-1",
    conversation_type: 1,
    call_id: "call-42",
    call_scope: 1,
    media_type: 2,
    sender_user_id: 9001,
    timeout_seconds: 30,
    is_mention: false
  });

  assert.equal(payload.type, "call.invite");
  assert.equal(payload.call_id, "call-42");
  assert.equal(payload.conversation_id, "conv-1");
  // Numeric envelope fields are coerced to strings (APNs custom keys + the
  // native handler read them as strings).
  assert.equal(payload.call_scope, "1");
  assert.equal(payload.media_type, "2");
  assert.equal(payload.sender_user_id, "9001");
  assert.equal(payload.timeout_seconds, "30");
  for (const [key, value] of Object.entries(payload)) {
    assert.equal(
      typeof value,
      "string",
      `field ${key} must be a string for the APNs VoIP payload`
    );
  }
});

test("apns_voip provider canDeliver only accepts devices with a non-empty voip_token", () => {
  assert.equal(
    ApnsVoipPushProvider.canDeliver({ device_id: "d1", voip_token: "abc" }),
    true
  );
  assert.equal(
    ApnsVoipPushProvider.canDeliver({ device_id: "d1", voip_token: "  " }),
    false
  );
  assert.equal(ApnsVoipPushProvider.canDeliver({ device_id: "d1" }), false);
});

test("apns_voip provider rejects non-call payloads (routing guard)", async () => {
  ApnsVoipPushProvider.isConfigured = () => true;
  await assert.rejects(
    () =>
      ApnsVoipPushProvider.deliverToDevice(
        { device_id: "d1", voip_token: "abc" },
        {
          type: "chat.message",
          title: "Alice",
          body: "hello",
          conversation_id: "conv-1",
          conversation_type: 1,
          message_id: "msg-1",
          is_mention: false
        }
      ),
    /unsupported push type/
  );
});
