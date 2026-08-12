import {
  collectHomePresenceUserIds,
  mergePresenceSummary,
  PRESENCE_HOME_CHAT_LIMIT,
  PRESENCE_HOME_FRIEND_LIMIT,
  shouldRefreshPresence
} from "../src/utils/presence";
import {
  createMockConversation,
  createMockFriend
} from "./helpers/mobile-test-helpers";

describe("mobile presence utils", () => {
  test("collects only top direct chats and a small friend subset", () => {
    const conversations = Array.from(
      { length: PRESENCE_HOME_CHAT_LIMIT + 4 },
      (_, index) =>
        createMockConversation({
          type: 1,
          peer_id: index + 2,
          last_message_time: new Date(
            2026,
            0,
            PRESENCE_HOME_CHAT_LIMIT + 10 - index
          ).toISOString()
        })
    );
    const friends = Array.from(
      { length: PRESENCE_HOME_FRIEND_LIMIT + 5 },
      (_, index) =>
        createMockFriend({
          user_id: PRESENCE_HOME_CHAT_LIMIT + index + 100
        })
    );

    const userIds = collectHomePresenceUserIds({
      conversations,
      friends
    });

    expect(userIds).toHaveLength(
      PRESENCE_HOME_CHAT_LIMIT + PRESENCE_HOME_FRIEND_LIMIT
    );
    expect(userIds.slice(0, PRESENCE_HOME_CHAT_LIMIT)).toEqual(
      Array.from({ length: PRESENCE_HOME_CHAT_LIMIT }, (_, index) => index + 2)
    );
  });

  test("treats missing or expired timestamps as stale", () => {
    const now = 1_000_000;

    expect(shouldRefreshPresence(0, now, 60_000)).toBe(true);
    expect(shouldRefreshPresence(now - 30_000, now, 60_000)).toBe(false);
    expect(shouldRefreshPresence(now - 60_000, now, 60_000)).toBe(true);
  });

  test("keeps the newer activity time when a stale presence response arrives", () => {
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

    expect(merged).toEqual({
      is_online: false,
      active_device_count: 0,
      last_active_at: "2026-04-11T10:28:00.000Z"
    });
  });

  test("keeps the remembered latest activity time when state entry is rebuilt from an older sync", () => {
    const merged = mergePresenceSummary(
      null,
      {
        is_online: false,
        active_device_count: 0,
        last_active_at: "2026-04-10T15:00:00.000Z"
      },
      "2026-04-11T10:28:00.000Z"
    );

    expect(merged).toEqual({
      is_online: false,
      active_device_count: 0,
      last_active_at: "2026-04-11T10:28:00.000Z"
    });
  });

  test("accepts a newer activity time and promotes it as the latest known value", () => {
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

    expect(merged).toEqual({
      is_online: false,
      active_device_count: 0,
      last_active_at: "2026-04-11T10:30:00.000Z"
    });
  });
});
