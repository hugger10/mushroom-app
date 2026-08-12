import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const conversationCoreRepositoryModule = require("../dist/server/src/repository/conversation/conversation_core_repository.js");
const conversationReadStateRepositoryModule = require("../dist/server/src/repository/conversation/conversation_read_state_repository.js");
const conversationServiceModule = require("../dist/server/src/service/conversation/conversation_query_service.js");
const outboxRepositoryModule = require("../dist/server/src/repository/outbox_repository.js");
const privacyRepositoryModule = require("../dist/server/src/repository/privacy_repository.js");
const pgModule = require("../dist/server/src/db/pg.js");
const redisModule = require("../dist/server/src/cache/redis.js");
const wsModule = require("../dist/server/src/websocket/index.js");

const ConversationCoreRepository = conversationCoreRepositoryModule.default;
const ConversationReadStateRepository =
  conversationReadStateRepositoryModule.default;
const ConversationService = conversationServiceModule.default;
const OutboxRepository = outboxRepositoryModule.default;
const PrivacyRepository = privacyRepositoryModule.default;
const pg = pgModule.default;
const redis = redisModule.getRedis();
const { wsServer } = wsModule;

const originals = {
  tx: pg.tx,
  findById: ConversationCoreRepository.findById,
  markConversationRead: ConversationReadStateRepository.markConversationRead,
  insertEvents: OutboxRepository.insertEvents,
  findManyByUserIds: PrivacyRepository.findManyByUserIds,
  dispatchToUser: wsServer.dispatchToUser
};

test.afterEach(() => {
  pg.tx = originals.tx;
  ConversationCoreRepository.findById = originals.findById;
  ConversationReadStateRepository.markConversationRead =
    originals.markConversationRead;
  OutboxRepository.insertEvents = originals.insertEvents;
  PrivacyRepository.findManyByUserIds = originals.findManyByUserIds;
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

function setupCommonStubs({
  readerId,
  peerId: _peerId,
  conversationId,
  conversationType,
  privacyRows
}) {
  pg.tx = async cb => cb({});
  ConversationCoreRepository.findById = async () => ({
    id: conversationId,
    type: conversationType,
    message_seq: 10
  });
  ConversationReadStateRepository.markConversationRead = async () => ({
    conversation_id: conversationId,
    user_id: readerId,
    read_seq: 5,
    previous_read_seq: 0,
    unread_count: 0,
    updated_at: new Date()
  });
  PrivacyRepository.findManyByUserIds = async () => privacyRows ?? [];
  wsServer.dispatchToUser = async () => {};
}

test("1:1 markConversationRead: reader opted out -> no conversation.sync to peer", async () => {
  const readerId = 1001;
  const peerId = 1002;
  const conversationId = "conv-priv-1";

  setupCommonStubs({
    readerId,
    peerId,
    conversationId,
    conversationType: 1,
    privacyRows: [
      {
        user_id: readerId,
        discoverable_by_username: 0,
        discoverable_by_phone: 0,
        message_permission: 0,
        presence_visibility: 0,
        read_receipts_visibility: 2,
        version: 1,
        updated_at: new Date()
      }
    ]
  });

  const events = [];
  OutboxRepository.insertEvents = async (_t, batch) => {
    events.push(...batch);
  };

  await ConversationService.markConversationRead(readerId, conversationId, 5, {
    memberUserIds: [readerId, peerId],
    messageSeq: 10,
    conversationType: 1
  });

  const syncEvents = events.filter(e => e.event_type === "conversation.sync");
  assert.equal(syncEvents.length, 0, "no peer sync when reader opted out");
  const readEvents = events.filter(e => e.event_type === "conversation.read");
  assert.equal(readEvents.length, 1, "reader still gets own conversation.read");
});

test("1:1 markConversationRead: peer opted out -> no conversation.sync to peer", async () => {
  const readerId = 1001;
  const peerId = 1002;
  const conversationId = "conv-priv-2";

  setupCommonStubs({
    readerId,
    peerId,
    conversationId,
    conversationType: 1,
    privacyRows: [
      {
        user_id: peerId,
        discoverable_by_username: 0,
        discoverable_by_phone: 0,
        message_permission: 0,
        presence_visibility: 0,
        read_receipts_visibility: 2,
        version: 1,
        updated_at: new Date()
      }
    ]
  });

  const events = [];
  OutboxRepository.insertEvents = async (_t, batch) => {
    events.push(...batch);
  };

  await ConversationService.markConversationRead(readerId, conversationId, 5, {
    memberUserIds: [readerId, peerId],
    messageSeq: 10,
    conversationType: 1
  });

  const syncEvents = events.filter(e => e.event_type === "conversation.sync");
  assert.equal(syncEvents.length, 0, "no peer sync when peer opted out");
});

test("1:1 markConversationRead: both visible -> conversation.sync delivered", async () => {
  const readerId = 1001;
  const peerId = 1002;
  const conversationId = "conv-priv-3";

  setupCommonStubs({
    readerId,
    peerId,
    conversationId,
    conversationType: 1,
    privacyRows: []
  });

  const events = [];
  OutboxRepository.insertEvents = async (_t, batch) => {
    events.push(...batch);
  };

  await ConversationService.markConversationRead(readerId, conversationId, 5, {
    memberUserIds: [readerId, peerId],
    messageSeq: 10,
    conversationType: 1
  });

  const syncEvents = events.filter(e => e.event_type === "conversation.sync");
  assert.equal(syncEvents.length, 1);
  assert.equal(syncEvents[0].target_user_id, peerId);
});

test("group markConversationRead: privacy NOT applied to conversation.sync (group uses group_read frames)", async () => {
  const readerId = 1001;
  const memberId = 1002;
  const conversationId = "conv-priv-grp";

  setupCommonStubs({
    readerId,
    peerId: memberId,
    conversationId,
    conversationType: 2,
    privacyRows: [
      {
        user_id: readerId,
        discoverable_by_username: 0,
        discoverable_by_phone: 0,
        message_permission: 0,
        presence_visibility: 0,
        read_receipts_visibility: 2,
        version: 1,
        updated_at: new Date()
      }
    ]
  });

  const events = [];
  OutboxRepository.insertEvents = async (_t, batch) => {
    events.push(...batch);
  };

  await ConversationService.markConversationRead(readerId, conversationId, 5, {
    memberUserIds: [readerId, memberId],
    messageSeq: 10,
    conversationType: 2
  });

  const syncEvents = events.filter(e => e.event_type === "conversation.sync");
  // In group mode, conversation.sync still fans out (it's metadata, not read receipt)
  assert.equal(syncEvents.length, 1);
  assert.equal(syncEvents[0].target_user_id, memberId);
});
