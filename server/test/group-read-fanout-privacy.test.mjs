import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const conversationServiceModule = require("../dist/server/src/service/conversation/conversation_query_service.js");
const messageRepositoryModule = require("../dist/server/src/repository/message_repository.js");
const privacyRepositoryModule = require("../dist/server/src/repository/privacy_repository.js");
const pgModule = require("../dist/server/src/db/pg.js");
const redisModule = require("../dist/server/src/cache/redis.js");
const wsModule = require("../dist/server/src/websocket/index.js");

const ConversationService = conversationServiceModule.default;
const MessageRepository = messageRepositoryModule.default;
const PrivacyRepository = privacyRepositoryModule.default;
const pg = pgModule.default;
const redis = redisModule.getRedis();
const { wsServer } = wsModule;

const originals = {
  findByUserId: PrivacyRepository.findByUserId,
  findManyByUserIds: PrivacyRepository.findManyByUserIds,
  findDistinctSenderIdsInSeqRange:
    MessageRepository.findDistinctSenderIdsInSeqRange,
  manyOrNone: pg.manyOrNone,
  dispatchToUser: wsServer.dispatchToUser
};

test.afterEach(() => {
  PrivacyRepository.findByUserId = originals.findByUserId;
  PrivacyRepository.findManyByUserIds = originals.findManyByUserIds;
  MessageRepository.findDistinctSenderIdsInSeqRange =
    originals.findDistinctSenderIdsInSeqRange;
  pg.manyOrNone = originals.manyOrNone;
  wsServer.dispatchToUser = originals.dispatchToUser;
});

test.after(() => {
  try {
    redis.disconnect();
  } catch (e) {
    void e;
  }
  try {
    wsServer.wss?.close?.();
  } catch (e) {
    void e;
  }
});

const defaultPrivacy = (userId, optedOut = false) => ({
  user_id: userId,
  discoverable_by_username: 0,
  discoverable_by_phone: 0,
  message_permission: 0,
  presence_visibility: 0,
  read_receipts_visibility: optedOut ? 2 : 0,
  version: 1,
  updated_at: new Date()
});

async function invokeFanout(params) {
  // dispatchGroupReadFanout is declared `private` in TS, but at runtime it's a
  // plain method on the singleton. Access it directly to bypass the public
  // markConversationRead -> tx flow which would require a live pg.
  return ConversationService.dispatchGroupReadFanout(params);
}

test("group_read fanout: reader opted out -> dispatches nothing", async () => {
  PrivacyRepository.findByUserId = async () => defaultPrivacy(1001, true);
  const dispatches = [];
  wsServer.dispatchToUser = async (uid, msg) => {
    dispatches.push({ uid, msg });
  };

  await invokeFanout({
    conversationId: "g1",
    readerUserId: 1001,
    previousReadSeq: 0,
    newReadSeq: 10,
    updatedAt: new Date()
  });

  assert.equal(dispatches.length, 0);
});

test("group_read fanout: sender opted out -> excluded from dispatch", async () => {
  PrivacyRepository.findByUserId = async () => defaultPrivacy(1001, false);
  MessageRepository.findDistinctSenderIdsInSeqRange = async () => [
    1002, 1003, 1004
  ];
  pg.manyOrNone = async () => [];
  PrivacyRepository.findManyByUserIds = async () => [
    defaultPrivacy(1003, true) // 1003 opted out
  ];

  const dispatched = [];
  wsServer.dispatchToUser = async (uid, msg) => {
    dispatched.push({ uid, msg });
  };

  await invokeFanout({
    conversationId: "g2",
    readerUserId: 1001,
    previousReadSeq: 0,
    newReadSeq: 10,
    updatedAt: new Date()
  });

  const ids = dispatched.map(d => d.uid).sort();
  assert.deepEqual(ids, [1002, 1004]);
  for (const d of dispatched) {
    assert.equal(d.msg.messageClassify, "group_read");
    assert.equal(d.msg.reader_user_id, 1001);
    assert.equal(d.msg.last_read_seq, 10);
  }
});

test("group_read fanout: all senders opted out -> no dispatch", async () => {
  PrivacyRepository.findByUserId = async () => defaultPrivacy(1001, false);
  MessageRepository.findDistinctSenderIdsInSeqRange = async () => [1002, 1003];
  pg.manyOrNone = async () => [];
  PrivacyRepository.findManyByUserIds = async () => [
    defaultPrivacy(1002, true),
    defaultPrivacy(1003, true)
  ];

  const dispatched = [];
  wsServer.dispatchToUser = async (uid, msg) => {
    dispatched.push({ uid, msg });
  };

  await invokeFanout({
    conversationId: "g3",
    readerUserId: 1001,
    previousReadSeq: 0,
    newReadSeq: 10,
    updatedAt: new Date()
  });

  assert.equal(dispatched.length, 0);
});

test("group_read fanout: blocked sender excluded even before privacy", async () => {
  PrivacyRepository.findByUserId = async () => defaultPrivacy(1001, false);
  MessageRepository.findDistinctSenderIdsInSeqRange = async () => [1002, 1003];
  // 1003 blocks reader 1001
  pg.manyOrNone = async () => [{ blocker_id: 1003, blocked_id: 1001 }];
  PrivacyRepository.findManyByUserIds = async () => [];

  const dispatched = [];
  wsServer.dispatchToUser = async (uid, msg) => {
    dispatched.push({ uid, msg });
  };

  await invokeFanout({
    conversationId: "g4",
    readerUserId: 1001,
    previousReadSeq: 0,
    newReadSeq: 10,
    updatedAt: new Date()
  });

  const ids = dispatched.map(d => d.uid);
  assert.deepEqual(ids, [1002]);
});
