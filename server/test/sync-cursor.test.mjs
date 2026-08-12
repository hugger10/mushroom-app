import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const syncCursorModule = require("../dist/server/src/utils/sync_cursor.js");
const messageServiceModule = require("../dist/server/src/service/message_service.js");
const messageRepositoryModule = require("../dist/server/src/repository/message_repository.js");

const { decodeSyncCursor, encodeSyncCursor } = syncCursorModule;
const MessageService = messageServiceModule.default;
const MessageRepository = messageRepositoryModule.default;

const originalFindMessageStatesByUser =
  MessageRepository.findMessageStatesByUser;

test.afterEach(() => {
  MessageRepository.findMessageStatesByUser = originalFindMessageStatesByUser;
});

test("decodeSyncCursor accepts stable JSON cursor and legacy ISO timestamps", () => {
  assert.deepEqual(
    decodeSyncCursor(
      '{"updated_at":"2026-04-01T00:00:00.000Z","entity_id":"42"}'
    ),
    {
      updated_at: "2026-04-01T00:00:00.000Z",
      entity_id: "42"
    }
  );

  assert.deepEqual(decodeSyncCursor("2026-04-01T00:00:00.000Z"), {
    updated_at: "2026-04-01T00:00:00.000Z",
    entity_id: "0"
  });

  assert.equal(
    encodeSyncCursor({
      updated_at: "2026-04-01T00:00:00.000Z",
      entity_id: "42"
    }),
    '{"updated_at":"2026-04-01T00:00:00.000Z","entity_id":"42"}'
  );
});

test("syncMessageStates returns paged stable cursors", async () => {
  MessageRepository.findMessageStatesByUser = async (
    _userId,
    cursor,
    limit
  ) => {
    assert.deepEqual(cursor, {
      updated_at: "2026-04-01T00:00:00.000Z",
      entity_id: "10"
    });
    // 实现采用 pageSize + 1 探测 hasMore，所以传入 limit 应为 pageSize+1
    assert.equal(limit, 3);

    return [
      {
        message_id: "101",
        conversation_id: "conv-1",
        is_favorited: true,
        is_pinned: false,
        updated_at: new Date("2026-04-01T00:00:01.000Z")
      },
      {
        message_id: "102",
        conversation_id: "conv-1",
        is_favorited: false,
        is_pinned: true,
        updated_at: new Date("2026-04-01T00:00:02.000Z")
      },
      {
        message_id: "103",
        conversation_id: "conv-2",
        is_favorited: false,
        is_pinned: false,
        updated_at: new Date("2026-04-01T00:00:03.000Z")
      }
    ];
  };

  const result = await MessageService.syncMessageStates(
    1001,
    {
      updated_at: "2026-04-01T00:00:00.000Z",
      entity_id: "10"
    },
    2
  );

  assert.equal(result.states.length, 2);
  assert.equal(result.hasMore, true);
  assert.equal(
    result.nextSyncCursor,
    '{"updated_at":"2026-04-01T00:00:02.000Z","entity_id":"102"}'
  );
  assert.equal(result.lastSyncTime, "2026-04-01T00:00:02.000Z");
  assert.deepEqual(result.states[0], {
    message_id: "101",
    conversation_id: "conv-1",
    is_favorited: 1,
    is_pinned: 0,
    updated_at: "2026-04-01T00:00:01.000Z"
  });
});
