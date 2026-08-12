import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const fcmModule = require("../dist/server/src/service/push/fcm_push_provider.js");

const FcmPushProvider = fcmModule.default;

function build(token, payload) {
  return FcmPushProvider.buildMessage(token, payload);
}

test("fcm chat.message iOS aps sets mutable-content for NSE", () => {
  const msg = build("tok-1", {
    type: "chat.message",
    title: "标题",
    body: "正文"
  });
  const aps = msg.message.apns.payload.aps;
  assert.equal(aps["mutable-content"], 1, "chat.message must trigger the NSE");
  assert.equal(aps.category, "MUSHROOM_MESSAGE");
  assert.equal(aps.sound, "default");
});

test("fcm call.invite iOS aps keeps content-available and no mutable-content", () => {
  const msg = build("tok-2", {
    type: "call.invite",
    title: "来电",
    body: "邀请"
  });
  const aps = msg.message.apns.payload.aps;
  assert.equal(aps["content-available"], 1);
  assert.equal(aps.category, "MUSHROOM_CALL");
  assert.ok(
    !("mutable-content" in aps),
    "call.invite should not set mutable-content"
  );
});

test("fcm chat.message silent omits sound but keeps mutable-content", () => {
  const msg = build("tok-3", {
    type: "chat.message",
    title: "T",
    body: "B",
    silent: true
  });
  const aps = msg.message.apns.payload.aps;
  assert.equal(aps["mutable-content"], 1);
  assert.ok(!("sound" in aps), "silent push must omit sound");
});

test("fcm chat.message sets badge for chat but not for calls", () => {
  const chatMsg = build("tok-4", {
    type: "chat.message",
    title: "T",
    body: "B",
    badge: 5
  });
  assert.equal(chatMsg.message.apns.payload.aps.badge, 5);

  const callMsg = build("tok-5", {
    type: "call.invite",
    title: "T",
    body: "B",
    badge: 9
  });
  assert.ok(!("badge" in callMsg.message.apns.payload.aps));
});

test("fcm chat.message carries the JSON data payload", () => {
  const msg = build("tok-6", {
    type: "chat.message",
    title: "T",
    body: "B",
    conversation_id: "conv-1",
    message_id: "msg-1"
  });
  const data = msg.message.data;
  assert.equal(data.type, "chat.message");
  assert.equal(data.conversation_id, "conv-1");
  assert.equal(data.message_id, "msg-1");
});
