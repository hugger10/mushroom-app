import {
  mergePresenceEntriesByUserId,
  mergePresenceSummary,
  PRESENCE_DIRECT_CHAT_STALE_MS,
  shouldRefreshPresence
} from "@mushroom/shared";

describe("shared presence logic", () => {
  test("keeps the newer remembered activity time for electron chat headers", () => {
    const merged = mergePresenceSummary(
      {
        is_online: false,
        active_device_count: 0,
        last_active_at: "2026-04-17T10:27:00.000Z"
      },
      {
        is_online: false,
        active_device_count: 0,
        last_active_at: "2026-04-17T10:24:00.000Z"
      },
      "2026-04-17T10:27:00.000Z"
    );

    expect(merged).toEqual({
      is_online: false,
      active_device_count: 0,
      last_active_at: "2026-04-17T10:27:00.000Z"
    });
  });

  test("uses the shared direct-chat refresh interval", () => {
    expect(
      shouldRefreshPresence(
        1_000,
        1_000 + (PRESENCE_DIRECT_CHAT_STALE_MS - 1_000),
        PRESENCE_DIRECT_CHAT_STALE_MS
      )
    ).toBe(false);
    expect(
      shouldRefreshPresence(
        1_000,
        1_000 + PRESENCE_DIRECT_CHAT_STALE_MS,
        PRESENCE_DIRECT_CHAT_STALE_MS
      )
    ).toBe(true);
  });

  test("merges websocket presence updates into a shared user map", () => {
    const result = mergePresenceEntriesByUserId(
      {
        2: {
          is_online: true,
          active_device_count: 1,
          last_active_at: "2026-04-17T10:27:00.000Z"
        }
      },
      [
        {
          user_id: 2,
          is_online: false,
          active_device_count: 0,
          last_active_at: "2026-04-17T10:20:00.000Z"
        }
      ],
      {
        2: "2026-04-17T10:27:00.000Z"
      }
    );

    expect(result.nextPresenceByUserId[2]).toEqual({
      is_online: false,
      active_device_count: 0,
      last_active_at: "2026-04-17T10:27:00.000Z"
    });
  });
});
