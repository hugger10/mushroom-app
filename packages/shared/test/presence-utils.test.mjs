import test from "node:test";
import assert from "node:assert/strict";
import {
  getLastOwnDeliveredMessageSequence,
  getNextMentionUnreadCount,
  getNextUnreadCount,
  hasMatchingMessage,
  hasPeerReadMessage,
  mergePresenceEntriesByUserId,
  mergePresenceSummary,
  PRESENCE_DIRECT_CHAT_STALE_MS,
  resolvePresenceLevel,
  shouldRefreshPresence
} from "../dist/index.mjs";

test("shouldRefreshPresence treats missing and expired timestamps as stale", () => {
  const now = 1_000_000;

  assert.equal(
    shouldRefreshPresence(0, now, PRESENCE_DIRECT_CHAT_STALE_MS),
    true
  );
  assert.equal(
    shouldRefreshPresence(now - 1_000, now, PRESENCE_DIRECT_CHAT_STALE_MS),
    false
  );
  assert.equal(
    shouldRefreshPresence(
      now - PRESENCE_DIRECT_CHAT_STALE_MS,
      now,
      PRESENCE_DIRECT_CHAT_STALE_MS
    ),
    true
  );
});

test("mergePresenceSummary keeps the newer current activity time", () => {
  const current = {
    is_online: false,
    active_device_count: 0,
    last_active_at: "2026-04-11T10:28:00.000Z"
  };

  const merged = mergePresenceSummary(current, {
    is_online: false,
    active_device_count: 0,
    last_active_at: "2026-04-10T15:00:00.000Z"
  });

  assert.deepEqual(merged, {
    is_online: false,
    active_device_count: 0,
    last_active_at: "2026-04-11T10:28:00.000Z",
    observed_at: undefined
  });
});

test("mergePresenceSummary keeps the remembered latest activity time", () => {
  const merged = mergePresenceSummary(
    null,
    {
      is_online: false,
      active_device_count: 0,
      last_active_at: "2026-04-10T15:00:00.000Z"
    },
    "2026-04-11T10:28:00.000Z"
  );

  assert.deepEqual(merged, {
    is_online: false,
    active_device_count: 0,
    last_active_at: "2026-04-11T10:28:00.000Z",
    observed_at: undefined
  });
});

test("mergePresenceSummary accepts a newer activity time", () => {
  const merged = mergePresenceSummary(
    {
      is_online: false,
      active_device_count: 0,
      last_active_at: "2026-04-11T10:28:00.000Z"
    },
    {
      is_online: false,
      active_device_count: 0,
      last_active_at: "2026-04-11T10:30:00.000Z"
    },
    "2026-04-11T10:28:00.000Z"
  );

  assert.deepEqual(merged, {
    is_online: false,
    active_device_count: 0,
    last_active_at: "2026-04-11T10:30:00.000Z",
    observed_at: undefined
  });
});

test("mergePresenceEntriesByUserId updates map entries and preserves latest activity timestamps", () => {
  const result = mergePresenceEntriesByUserId(
    {
      2: {
        is_online: true,
        active_device_count: 1,
        last_active_at: "2026-04-11T10:30:00.000Z"
      }
    },
    [
      {
        user_id: 2,
        is_online: false,
        active_device_count: 0,
        last_active_at: "2026-04-11T10:20:00.000Z"
      }
    ],
    {
      2: "2026-04-11T10:30:00.000Z"
    }
  );

  assert.deepEqual(result.nextPresenceByUserId, {
    2: {
      is_online: false,
      active_device_count: 0,
      last_active_at: "2026-04-11T10:30:00.000Z",
      observed_at: undefined
    }
  });
  assert.deepEqual(result.nextLastActiveAtByUserId, {
    2: "2026-04-11T10:30:00.000Z"
  });
});

test("getLastOwnDeliveredMessageSequence returns the newest own message sequence", () => {
  const sequence = getLastOwnDeliveredMessageSequence(
    [
      {
        client_message_id: "m1",
        server_message_id: "s1",
        client_conversation_id: "c1",
        sequence: 1,
        content: { type: 1, text: "first" },
        sender_id: 1,
        created_at: "2026-04-17T10:00:00.000Z",
        type: 1,
        status: 0
      },
      {
        client_message_id: "m2",
        server_message_id: "s2",
        client_conversation_id: "c1",
        sequence: 2,
        content: { type: 1, text: "second" },
        sender_id: 1,
        created_at: "2026-04-17T10:01:00.000Z",
        type: 1,
        status: 0
      }
    ],
    1
  );

  assert.equal(sequence, 2);
});

test("hasPeerReadMessage returns true only when peer sequence covers the message", () => {
  assert.equal(hasPeerReadMessage(3, 2), true);
  assert.equal(hasPeerReadMessage(1, 2), false);
  assert.equal(hasPeerReadMessage(0, 0), false);
});

test("hasMatchingMessage matches duplicate realtime payloads by server message id", () => {
  assert.equal(
    hasMatchingMessage(
      [
        {
          client_message_id: "m1",
          server_message_id: "s1"
        }
      ],
      {
        client_message_id: "m1-copy",
        server_message_id: "s1"
      }
    ),
    true
  );
});

test("getNextUnreadCount does not increment duplicate incoming messages", () => {
  assert.equal(
    getNextUnreadCount({
      currentUnreadCount: 1,
      isIncoming: true,
      shouldMarkRead: false,
      isDuplicate: true
    }),
    1
  );
  assert.equal(
    getNextUnreadCount({
      currentUnreadCount: 1,
      isIncoming: true,
      shouldMarkRead: false,
      isDuplicate: false
    }),
    2
  );
});

test("getNextMentionUnreadCount preserves mention count for duplicates", () => {
  assert.equal(
    getNextMentionUnreadCount({
      currentMentionUnreadCount: 1,
      isIncoming: true,
      shouldMarkRead: false,
      isDuplicate: true,
      mentionMe: true
    }),
    1
  );
  assert.equal(
    getNextMentionUnreadCount({
      currentMentionUnreadCount: 1,
      isIncoming: true,
      shouldMarkRead: true,
      isDuplicate: false,
      mentionMe: true
    }),
    0
  );
});

test("resolvePresenceLevel returns online when explicitly online", () => {
  assert.equal(resolvePresenceLevel(true, undefined, 1_000_000), "online");
  assert.equal(
    resolvePresenceLevel(true, "2026-01-01T00:00:00.000Z", 1_000_000),
    "online"
  );
});

test("resolvePresenceLevel returns offline when missing or invalid timestamp", () => {
  assert.equal(resolvePresenceLevel(false, undefined, 1_000_000), "offline");
  assert.equal(resolvePresenceLevel(false, null, 1_000_000), "offline");
  assert.equal(resolvePresenceLevel(false, "not-a-date", 1_000_000), "offline");
});

test("resolvePresenceLevel buckets last_active_at into 5m / 60m windows", () => {
  const now = Date.parse("2026-04-11T12:00:00.000Z");

  // 5 minutes exact -> online
  assert.equal(
    resolvePresenceLevel(false, "2026-04-11T11:55:00.000Z", now),
    "online"
  );
  // 5m + 1s -> recent
  assert.equal(
    resolvePresenceLevel(false, "2026-04-11T11:54:59.000Z", now),
    "recent"
  );
  // 60 minutes exact -> recent
  assert.equal(
    resolvePresenceLevel(false, "2026-04-11T11:00:00.000Z", now),
    "recent"
  );
  // > 60m -> offline
  assert.equal(
    resolvePresenceLevel(false, "2026-04-11T10:59:59.000Z", now),
    "offline"
  );
});

test("resolvePresenceLevel treats clock-skewed future timestamps as online", () => {
  const now = Date.parse("2026-04-11T12:00:00.000Z");
  assert.equal(
    resolvePresenceLevel(false, "2026-04-11T12:00:30.000Z", now),
    "online"
  );
});

// observed_at 单调性保护：HTTP/WS 乱序到达时不应让旧 incoming 覆盖更新的 current。
// 该保护是修复 "进入会话 header 短暂闪烁 X 小时前活跃 → 在线" 的关键防线。

test("mergePresenceSummary keeps current is_online when incoming observed_at is older (HTTP/WS race)", () => {
  // 模拟：WS snapshot 已先到（current=true, observed=10:30:01），
  // 然后 HTTP /presence-batch 的旧响应到达（incoming=false, observed=10:30:00）。
  const merged = mergePresenceSummary(
    {
      is_online: true,
      active_device_count: 1,
      last_active_at: "2026-04-11T10:30:00.000Z",
      observed_at: "2026-04-11T10:30:01.000Z"
    },
    {
      is_online: false,
      active_device_count: 0,
      last_active_at: "2026-04-11T10:25:00.000Z",
      observed_at: "2026-04-11T10:30:00.000Z"
    }
  );

  assert.equal(
    merged.is_online,
    true,
    "stale incoming must not flip is_online"
  );
  assert.equal(merged.active_device_count, 1);
  // last_active_at 仍可由 current 的更新值保留
  assert.equal(merged.last_active_at, "2026-04-11T10:30:00.000Z");
  assert.equal(merged.observed_at, "2026-04-11T10:30:01.000Z");
});

test("mergePresenceSummary applies newer incoming when observed_at is newer", () => {
  const merged = mergePresenceSummary(
    {
      is_online: false,
      active_device_count: 0,
      last_active_at: "2026-04-11T07:00:00.000Z",
      observed_at: "2026-04-11T10:30:00.000Z"
    },
    {
      is_online: true,
      active_device_count: 2,
      last_active_at: "2026-04-11T10:30:05.000Z",
      observed_at: "2026-04-11T10:30:05.000Z"
    }
  );

  assert.equal(merged.is_online, true);
  assert.equal(merged.active_device_count, 2);
  assert.equal(merged.observed_at, "2026-04-11T10:30:05.000Z");
});

test("mergePresenceSummary falls back to incoming when observed_at is missing (legacy server)", () => {
  // 老服务端不带 observed_at 时退化为旧行为（incoming 优先），保证向后兼容。
  const merged = mergePresenceSummary(
    {
      is_online: true,
      active_device_count: 1,
      last_active_at: "2026-04-11T10:30:00.000Z"
    },
    {
      is_online: false,
      active_device_count: 0,
      last_active_at: "2026-04-11T10:25:00.000Z"
    }
  );

  assert.equal(merged.is_online, false);
  assert.equal(merged.active_device_count, 0);
});

test("mergePresenceEntriesByUserId forwards observed_at into merge", () => {
  const result = mergePresenceEntriesByUserId(
    {
      2: {
        is_online: true,
        active_device_count: 1,
        last_active_at: "2026-04-11T10:30:00.000Z",
        observed_at: "2026-04-11T10:30:01.000Z"
      }
    },
    [
      {
        user_id: 2,
        is_online: false,
        active_device_count: 0,
        last_active_at: "2026-04-11T10:20:00.000Z",
        observed_at: "2026-04-11T10:30:00.000Z" // older → stale
      }
    ]
  );

  assert.equal(result.nextPresenceByUserId[2].is_online, true);
  assert.equal(result.nextPresenceByUserId[2].active_device_count, 1);
  assert.equal(
    result.nextPresenceByUserId[2].observed_at,
    "2026-04-11T10:30:01.000Z"
  );
});
