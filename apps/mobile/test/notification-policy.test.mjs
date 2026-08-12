// Unit tests for the pure notification policy / dedup helpers.
//
// Runs under Node 22's built-in TypeScript stripping (no Jest, no React
// Native). Mirrors the per-package `node --test` pattern used by
// `packages/shared/test/*.test.mjs`.

import { test } from "node:test";
import { strict as assert } from "node:assert";

import {
  shouldDisplayNotification,
  createNotificationDedup,
  isQuietHoursActive
} from "../src/platform/notification-policy.ts";

const basePrefs = {
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
  quietHoursAllowCalls: true
};

test("chat: foreground + non-active conversation → shows", () => {
  const ok = shouldDisplayNotification({ type: "chat.message" }, basePrefs, {
    appState: "active",
    isActiveConversation: false
  });
  assert.equal(ok, true);
});

test("chat: foreground + active conversation → suppressed", () => {
  const ok = shouldDisplayNotification({ type: "chat.message" }, basePrefs, {
    appState: "active",
    isActiveConversation: true
  });
  assert.equal(ok, false);
});

test("chat: background → shows even if conversation is active", () => {
  const ok = shouldDisplayNotification({ type: "chat.message" }, basePrefs, {
    appState: "background",
    isActiveConversation: true
  });
  assert.equal(ok, true);
});

test("chat: messagesEnabled=false → suppressed everywhere", () => {
  for (const appState of ["active", "background"]) {
    const ok = shouldDisplayNotification(
      { type: "chat.message" },
      { ...basePrefs, messagesEnabled: false },
      { appState }
    );
    assert.equal(ok, false, `appState=${appState}`);
  }
});

test("chat: inAppBannerEnabled=false suppresses only in foreground", () => {
  const fg = shouldDisplayNotification(
    { type: "chat.message" },
    { ...basePrefs, inAppBannerEnabled: false },
    { appState: "active" }
  );
  const bg = shouldDisplayNotification(
    { type: "chat.message" },
    { ...basePrefs, inAppBannerEnabled: false },
    { appState: "background" }
  );
  assert.equal(fg, false);
  assert.equal(bg, true);
});

test("chat: muted conversation → suppressed unless @-mentioned", () => {
  const plain = shouldDisplayNotification({ type: "chat.message" }, basePrefs, {
    isMuted: true
  });
  const mention = shouldDisplayNotification(
    { type: "chat.message", isMentioned: true },
    basePrefs,
    { isMuted: true }
  );
  assert.equal(plain, false);
  assert.equal(mention, true);
});

test("chat: mentionOnly preference → only @ slips through", () => {
  const plain = shouldDisplayNotification(
    { type: "chat.message" },
    { ...basePrefs, mentionOnly: true }
  );
  const mention = shouldDisplayNotification(
    { type: "chat.message", isMentioned: true },
    { ...basePrefs, mentionOnly: true }
  );
  assert.equal(plain, false);
  assert.equal(mention, true);
});

test("chat: groupMessagesEnabled=false suppresses group, allows direct", () => {
  const grp = shouldDisplayNotification(
    { type: "chat.message", isGroup: true },
    { ...basePrefs, groupMessagesEnabled: false }
  );
  const direct = shouldDisplayNotification(
    { type: "chat.message", isGroup: false },
    { ...basePrefs, groupMessagesEnabled: false }
  );
  const grpMention = shouldDisplayNotification(
    { type: "chat.message", isGroup: true, isMentioned: true },
    { ...basePrefs, groupMessagesEnabled: false }
  );
  assert.equal(grp, false);
  assert.equal(direct, true);
  assert.equal(grpMention, true);
});

test("quiet hours: blocks chat, allows mentions if configured", () => {
  // 22:00–08:00 nightly window, current = 23:30 (in-window).
  const now = new Date(2024, 0, 1, 23, 30);
  const prefs = { ...basePrefs, quietHoursEnabled: true };
  const plain = shouldDisplayNotification({ type: "chat.message" }, prefs, {
    now
  });
  const mention = shouldDisplayNotification(
    { type: "chat.message", isMentioned: true },
    prefs,
    { now }
  );
  const mentionBlocked = shouldDisplayNotification(
    { type: "chat.message", isMentioned: true },
    { ...prefs, quietHoursAllowMentions: false },
    { now }
  );
  assert.equal(plain, false);
  assert.equal(mention, true);
  assert.equal(mentionBlocked, false);
});

test("quiet hours: call.invite respects quietHoursAllowCalls", () => {
  const now = new Date(2024, 0, 1, 23, 30);
  const prefs = { ...basePrefs, quietHoursEnabled: true };
  const allowed = shouldDisplayNotification({ type: "call.invite" }, prefs, {
    now
  });
  const blocked = shouldDisplayNotification(
    { type: "call.invite" },
    { ...prefs, quietHoursAllowCalls: false },
    { now }
  );
  assert.equal(allowed, true);
  assert.equal(blocked, false);
});

test("isQuietHoursActive: cross-midnight window", () => {
  const prefs = { ...basePrefs, quietHoursEnabled: true };
  assert.equal(isQuietHoursActive(prefs, new Date(2024, 0, 1, 23, 0)), true);
  assert.equal(isQuietHoursActive(prefs, new Date(2024, 0, 1, 7, 30)), true);
  assert.equal(isQuietHoursActive(prefs, new Date(2024, 0, 1, 12, 0)), false);
});

test("isQuietHoursActive: same-day window", () => {
  const prefs = {
    ...basePrefs,
    quietHoursEnabled: true,
    quietHoursStart: "09:00",
    quietHoursEnd: "17:00"
  };
  assert.equal(isQuietHoursActive(prefs, new Date(2024, 0, 1, 12, 0)), true);
  assert.equal(isQuietHoursActive(prefs, new Date(2024, 0, 1, 8, 0)), false);
  assert.equal(isQuietHoursActive(prefs, new Date(2024, 0, 1, 17, 0)), false);
});

test("call.invite: callsEnabled=false → suppressed", () => {
  const ok = shouldDisplayNotification(
    { type: "call.invite" },
    { ...basePrefs, callsEnabled: false }
  );
  assert.equal(ok, false);
});

test("dedup: reserves same id only once, second returns false", () => {
  const dedup = createNotificationDedup();
  assert.equal(dedup.reserve("msg-1"), true);
  assert.equal(dedup.reserve("msg-1"), false);
  assert.equal(dedup.reserve("msg-2"), true);
});

test("dedup: undefined id is never deduped (no key)", () => {
  const dedup = createNotificationDedup();
  assert.equal(dedup.reserve(undefined), true);
  assert.equal(dedup.reserve(undefined), true);
});

test("dedup: ttl expiry allows re-reservation", () => {
  const dedup = createNotificationDedup({ ttlMs: 1000 });
  assert.equal(dedup.reserve("msg-1", 1000), true);
  assert.equal(dedup.reserve("msg-1", 1500), false);
  assert.equal(dedup.reserve("msg-1", 2500), true);
});

test("dedup: capacity FIFO eviction", () => {
  const dedup = createNotificationDedup({ capacity: 2 });
  dedup.reserve("a");
  dedup.reserve("b");
  // size=2, ok
  dedup.reserve("c");
  // Insert order [a,b,c] → overflow 1 → evict "a".
  // Now tracked: [b, c]
  assert.equal(dedup.reserve("b"), false, "b still tracked");
  assert.equal(dedup.reserve("c"), false, "c still tracked");
  // "a" was evicted → reservable again
  assert.equal(dedup.reserve("a"), true, "a evicted, reservable again");
});

test("dedup: release allows the same id to be reserved again", () => {
  const dedup = createNotificationDedup();
  assert.equal(dedup.reserve("m1"), true, "first reserve ok");
  assert.equal(dedup.reserve("m1"), false, "second blocked");
  dedup.release("m1");
  assert.equal(
    dedup.reserve("m1"),
    true,
    "after release the same id is reservable"
  );
  // release of missing / undefined id is a no-op
  dedup.release(undefined);
  dedup.release("never-seen");
});
