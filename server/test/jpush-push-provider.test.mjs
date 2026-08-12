import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const configModule = require("../dist/server/src/utils/config.js");
const jpushModule = require("../dist/server/src/service/push/jpush_push_provider.js");

const config = configModule.config;
const JpushPushProvider = jpushModule.default;

const originalFetch = globalThis.fetch;

function withJpushConfig(appKey, masterSecret) {
  const prev = {
    jpushAppKey: config.push.jpushAppKey,
    jpushMasterSecret: config.push.jpushMasterSecret
  };
  config.push.jpushAppKey = appKey;
  config.push.jpushMasterSecret = masterSecret;
  return () => {
    config.push.jpushAppKey = prev.jpushAppKey;
    config.push.jpushMasterSecret = prev.jpushMasterSecret;
  };
}

function captureFetch() {
  let captured = null;
  globalThis.fetch = async (url, options) => {
    captured = {
      url,
      headers: options.headers,
      body: JSON.parse(options.body)
    };
    return {
      ok: true,
      json: async () => ({ msg_id: "mock-msg-id" })
    };
  };
  return () => captured;
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("jpush provider isConfigured requires appKey + masterSecret", () => {
  const restore = withJpushConfig("", "");
  assert.equal(JpushPushProvider.isConfigured(), false);

  withJpushConfig("app-key", "master-secret");
  assert.equal(JpushPushProvider.isConfigured(), true);

  withJpushConfig("app-key", "");
  assert.equal(JpushPushProvider.isConfigured(), false);
  restore();
});

test("jpush provider sends Android chat as a custom message (no auto notification)", async () => {
  const restore = withJpushConfig("app-key", "master-secret");
  const capture = captureFetch();

  await JpushPushProvider.deliverToDevice(
    {
      device_id: "android-device",
      device_type: 3,
      push_provider: "jpush",
      push_token: "reg-id-android",
      metadata: { platform: "android" }
    },
    { type: "chat.message", title: "群名", body: "正文" }
  );

  const req = capture();
  assert.ok(req, "fetch should have been called");
  assert.match(req.url, /\/v3\/push$/);
  assert.match(req.headers.Authorization, /^Basic /);
  assert.deepEqual(req.body.platform, ["android"]);
  assert.deepEqual(req.body.audience.registration_id, ["reg-id-android"]);
  assert.ok(req.body.message, "Android should use custom message");
  assert.equal(req.body.message.title, "chat.message");
  const parsed = JSON.parse(req.body.message.msg_content);
  assert.equal(parsed.type, "chat.message");
  assert.equal(parsed.title, "群名");
  assert.ok(!req.body.notification, "no notification block for Android");
  restore();
});

test("jpush provider sends iOS chat as an APNs notification with badge", async () => {
  const restore = withJpushConfig("app-key", "master-secret");
  const capture = captureFetch();

  await JpushPushProvider.deliverToDevice(
    {
      device_id: "ios-device",
      device_type: 3,
      push_provider: "jpush",
      push_token: "reg-id-ios",
      metadata: { platform: "ios" }
    },
    { type: "chat.message", title: "T", body: "B", badge: 3 }
  );

  const req = capture();
  assert.deepEqual(req.body.platform, ["ios"]);
  assert.ok(req.body.notification.ios, "iOS should use notification");
  assert.equal(req.body.notification.ios.badge, 3);
  assert.equal(req.body.notification.ios.category, "MUSHROOM_MESSAGE");
  assert.equal(
    req.body.notification.ios.mutable_content,
    true,
    "iOS chat should set mutable_content to trigger the NSE"
  );
  assert.ok(!req.body.message, "no custom message for iOS");
  restore();
});

test("jpush provider uses short TTL for incoming calls", async () => {
  const restore = withJpushConfig("app-key", "master-secret");
  const capture = captureFetch();

  await JpushPushProvider.deliverToDevice(
    {
      device_id: "android-device",
      device_type: 3,
      push_provider: "jpush",
      push_token: "reg-id",
      metadata: { platform: "android" }
    },
    { type: "call.invite", title: "来电", body: "邀请" }
  );

  const req = capture();
  assert.equal(req.body.options.time_to_live, 60);
  assert.equal(req.body.message.title, "call.invite");
  restore();
});

test("jpush provider throws on business error code", async () => {
  const restore = withJpushConfig("app-key", "master-secret");
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ error: { code: 1008, message: "appkey not match" } })
  });

  await assert.rejects(
    JpushPushProvider.deliverToDevice(
      {
        device_id: "d",
        device_type: 3,
        push_provider: "jpush",
        push_token: "reg-id",
        metadata: { platform: "android" }
      },
      { type: "chat.message", title: "T", body: "B" }
    ),
    /appkey not match/
  );
  restore();
});

test("jpush provider throws on non-2xx HTTP", async () => {
  const restore = withJpushConfig("app-key", "master-secret");
  globalThis.fetch = async () => ({
    ok: false,
    status: 401,
    text: async () => "Unauthorized"
  });

  await assert.rejects(
    JpushPushProvider.deliverToDevice(
      {
        device_id: "d",
        device_type: 3,
        push_provider: "jpush",
        push_token: "reg-id",
        metadata: { platform: "android" }
      },
      { type: "chat.message", title: "T", body: "B" }
    ),
    /401/
  );
  restore();
});
