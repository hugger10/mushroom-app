import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const blockServiceModule = require("../dist/server/src/service/block_service.js");
const contactServiceModule = require("../dist/server/src/service/contact_service.js");
const blockRepositoryModule = require("../dist/server/src/repository/block_repository.js");
const userRepositoryModule = require("../dist/server/src/repository/user_repository.js");
const contactRepositoryModule = require("../dist/server/src/repository/contact_repository.js");
const outboxRepositoryModule = require("../dist/server/src/repository/outbox_repository.js");
const pgModule = require("../dist/server/src/db/pg.js");
const websocketModule = require("../dist/server/src/websocket/index.js");
const redisModule = require("../dist/server/src/cache/redis.js");
const businessErrorModule = require("../dist/server/src/handler/business_error.js");

const BlockService = blockServiceModule.default;
const ContactService = contactServiceModule.default;
const BlockRepository = blockRepositoryModule.default;
const UserRepository = userRepositoryModule.default;
const ContactRepository = contactRepositoryModule.default;
const OutboxRepository = outboxRepositoryModule.default;
const pg = pgModule.default;
const { wsServer } = websocketModule;
const redis = redisModule.getRedis();
const { BusinessError } = businessErrorModule;

const originals = {
  tx: pg.tx,
  blockInsert: BlockRepository.insert,
  blockDelete: BlockRepository.delete,
  findById: UserRepository.findById,
  markContactDeleted: ContactRepository.markContactDeleted,
  outboxInsertEvents: OutboxRepository.insertEvents,
  dispatchToUser: wsServer.dispatchToUser
};

test.afterEach(() => {
  pg.tx = originals.tx;
  BlockRepository.insert = originals.blockInsert;
  BlockRepository.delete = originals.blockDelete;
  UserRepository.findById = originals.findById;
  ContactRepository.markContactDeleted = originals.markContactDeleted;
  OutboxRepository.insertEvents = originals.outboxInsertEvents;
  wsServer.dispatchToUser = originals.dispatchToUser;
});

/**
 * 通用 stub：让 `pg.tx(fn)` 直接调用 fn 并传入伪事务对象，
 * 同时把 OutboxRepository.insertEvents 置为 no-op，避免触达真实 DB。
 * 测试用例若需要捕获 outbox 写入，可自行覆写 OutboxRepository.insertEvents。
 */
function stubTransactional() {
  pg.tx = async fn => fn({});
  OutboxRepository.insertEvents = async () => undefined;
}

test.after(async () => {
  try {
    if (wsServer.heartbeatTimer) {
      clearInterval(wsServer.heartbeatTimer);
    }
  } catch (error) {
    void error;
  }
  try {
    if (wsServer.subscriber?.disconnect) {
      wsServer.subscriber.disconnect();
    }
  } catch (error) {
    void error;
  }
  try {
    if (wsServer.wss?.clients) {
      for (const client of wsServer.wss.clients) {
        client.close();
      }
    }
  } catch (error) {
    void error;
  }
  try {
    if (wsServer.wss?.close) {
      wsServer.wss.close();
    }
  } catch (error) {
    void error;
  }
  try {
    redis.disconnect();
  } catch (error) {
    void error;
  }
});

test("blockUser only records the block relation", async () => {
  const insertedBlocks = [];

  UserRepository.findById = async userId => ({
    id: userId,
    username: `user-${userId}`,
    nickname: `User ${userId}`
  });
  BlockRepository.insert = async (blockerId, blockedId) => {
    insertedBlocks.push({ blockerId, blockedId });
  };

  await BlockService.blockUser(7, 9);

  assert.deepEqual(insertedBlocks, [{ blockerId: 7, blockedId: 9 }]);
});

test("blockUser still succeeds when users have no direct conversation", async () => {
  UserRepository.findById = async userId => ({
    id: userId,
    username: `user-${userId}`,
    nickname: `User ${userId}`
  });
  BlockRepository.insert = async () => undefined;

  await BlockService.blockUser(7, 9);
});

test("unblockUser rejects when the relation does not exist", async () => {
  BlockRepository.delete = async () => ({ rowCount: 0 });

  await assert.rejects(
    () => BlockService.unblockUser(7, 9),
    error =>
      error instanceof BusinessError && error.message === "User is not blocked"
  );
});

test("deleteContact soft-deletes the saved contact without deleting conversations", async () => {
  const deletedPairs = [];

  stubTransactional();
  UserRepository.findById = async userId => ({
    id: userId,
    username: `user-${userId}`,
    nickname: `User ${userId}`
  });
  ContactRepository.markContactDeleted = async (userId, targetUserId) => {
    deletedPairs.push({ userId, targetUserId });
    return { rowCount: 1 };
  };

  await ContactService.deleteContact(7, 9);

  assert.deepEqual(deletedPairs, [{ userId: 7, targetUserId: 9 }]);
});

test("deleteContact rejects deleting yourself", async () => {
  await assert.rejects(
    () => ContactService.deleteContact(7, 7),
    error =>
      error instanceof BusinessError &&
      error.message === "Cannot delete yourself from contacts"
  );
});

// --- WS event dispatch tests ---

test("blockUser dispatches block_changed event to the blocker", async () => {
  const dispatched = [];

  UserRepository.findById = async userId => ({
    id: userId,
    user_id: userId,
    username: `user-${userId}`,
    nickname: `User ${userId}`,
    avatar_url: null,
    gender: 0,
    signature: null
  });
  BlockRepository.insert = async () => undefined;
  wsServer.dispatchToUser = async (userId, data) => {
    dispatched.push({ userId, data });
  };

  await BlockService.blockUser(7, 9);

  assert.equal(dispatched.length, 1);
  assert.equal(dispatched[0].userId, 7);
  assert.equal(dispatched[0].data.messageClassify, "block_changed");
  assert.equal(dispatched[0].data.action, "blocked");
  assert.equal(dispatched[0].data.block.blocked_id, 9);
});

test("unblockUser dispatches block_changed event with unblocked action", async () => {
  const dispatched = [];

  BlockRepository.delete = async () => ({ rowCount: 1 });
  wsServer.dispatchToUser = async (userId, data) => {
    dispatched.push({ userId, data });
  };

  await BlockService.unblockUser(7, 9);

  assert.equal(dispatched.length, 1);
  assert.equal(dispatched[0].userId, 7);
  assert.equal(dispatched[0].data.messageClassify, "block_changed");
  assert.equal(dispatched[0].data.action, "unblocked");
  assert.equal(dispatched[0].data.block.blocked_id, 9);
});

test("deleteContact dispatches contact_changed removed event and writes outbox", async () => {
  const dispatched = [];
  const outboxEvents = [];

  pg.tx = async fn => fn({});
  OutboxRepository.insertEvents = async (_tx, events) => {
    outboxEvents.push(...events);
    return undefined;
  };

  UserRepository.findById = async userId => ({
    id: userId,
    username: `user-${userId}`,
    nickname: `User ${userId}`
  });
  ContactRepository.markContactDeleted = async () => ({ rowCount: 1 });
  wsServer.dispatchToUser = async (userId, data) => {
    dispatched.push({ userId, data });
  };

  await ContactService.deleteContact(7, 9);

  assert.equal(dispatched.length, 1);
  assert.equal(dispatched[0].userId, 7);
  assert.equal(dispatched[0].data.messageClassify, "contact_changed");
  assert.equal(dispatched[0].data.action, "removed");
  assert.equal(dispatched[0].data.contact.user_id, 9);

  assert.equal(outboxEvents.length, 1);
  assert.equal(outboxEvents[0].event_type, "contact.changed");
  assert.equal(outboxEvents[0].target_user_id, 7);
  assert.equal(outboxEvents[0].payload.messageClassify, "contact_changed");
  assert.equal(outboxEvents[0].payload.action, "removed");
  assert.equal(outboxEvents[0].payload.contact.user_id, 9);
});
