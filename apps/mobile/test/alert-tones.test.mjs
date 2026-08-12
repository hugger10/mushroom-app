// Unit tests for the message-sound preference model + derivation helpers.
//
// Runs under Node 22's built-in TypeScript stripping (no Jest, no React
// Native). The module under test is intentionally free of RN/storage imports.

import { test } from "node:test";
import { strict as assert } from "node:assert";

import {
  getMessagesChannelId,
  messageSoundToAndroidSound,
  messageSoundToIosSound,
  normalizeMessageSound,
  normalizeMessageSoundLabel,
  shortHash,
  MESSAGES_CHANNEL_ID_PREFIX
} from "../src/platform/alert-tones/types.ts";

test("normalizeMessageSound: default for missing/invalid values", () => {
  for (const value of [undefined, null, "", 0, "unknown-name", "message.mp3"]) {
    assert.equal(normalizeMessageSound(value), null, String(value));
  }
});

test("normalizeMessageSound: passes through valid values", () => {
  assert.equal(normalizeMessageSound("silent"), "silent");
  assert.equal(normalizeMessageSound("message"), "message");
  assert.equal(normalizeMessageSound("fade"), "fade");
  assert.equal(normalizeMessageSound("system:Bloom"), "system:Bloom");
  assert.equal(
    normalizeMessageSound("content://media/internal/audio/media/42"),
    "content://media/internal/audio/media/42"
  );
});

test("normalizeMessageSoundLabel: only kept for content:// URIs", () => {
  assert.equal(normalizeMessageSoundLabel(null, "X"), undefined);
  assert.equal(normalizeMessageSoundLabel("silent", "X"), undefined);
  assert.equal(normalizeMessageSoundLabel("system:Bloom", "X"), undefined);
  assert.equal(
    normalizeMessageSoundLabel("content://a/b", "  My Tone  "),
    "My Tone"
  );
  assert.equal(normalizeMessageSoundLabel("content://a/b", "  "), undefined);
});

test("shortHash is deterministic and non-colliding for the tone space", () => {
  const values = ["default", "silent", "message", "fade", "system:Bloom"];
  assert.equal(shortHash("message"), shortHash("message"));
  const seen = new Set(values.map(shortHash));
  assert.equal(seen.size, values.length, "hash should not collide here");
  assert.match(shortHash("message"), /^[0-9a-f]{8}$/);
});

test("getMessagesChannelId: versioned + stable, changes with sound", () => {
  assert.equal(getMessagesChannelId(null), getMessagesChannelId(null));
  assert.equal(
    getMessagesChannelId(null),
    `${MESSAGES_CHANNEL_ID_PREFIX}-${shortHash("default")}`
  );
  assert.notEqual(getMessagesChannelId(null), getMessagesChannelId("message"));
  assert.notEqual(
    getMessagesChannelId("message"),
    getMessagesChannelId("fade")
  );
  assert.ok(
    getMessagesChannelId("message").startsWith(MESSAGES_CHANNEL_ID_PREFIX)
  );
});

test("messageSoundToIosSound: iOS foreground sound derivation", () => {
  assert.equal(messageSoundToIosSound(null), "default");
  assert.equal(messageSoundToIosSound("silent"), null); // omit ios.sound = silent
  assert.equal(messageSoundToIosSound("message"), "currentAlert.wav");
  assert.equal(messageSoundToIosSound("fade"), "currentAlert.wav");
  assert.equal(messageSoundToIosSound("system:Bloom"), "currentAlert.caf");
});

test("messageSoundToAndroidSound: notifee channel sound mapping", () => {
  assert.equal(messageSoundToAndroidSound(null), "default");
  assert.equal(messageSoundToAndroidSound("silent"), undefined);
  assert.equal(messageSoundToAndroidSound("message"), "message");
  assert.equal(messageSoundToAndroidSound("fade"), "element_fade");
  assert.equal(
    messageSoundToAndroidSound("content://media/42"),
    "content://media/42"
  );
  assert.equal(messageSoundToAndroidSound("system:Bloom"), undefined);
});
