import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const conversationCoreRepositoryModule = require("../dist/server/src/repository/conversation/conversation_core_repository.js");
const conversationMemberRepositoryModule = require("../dist/server/src/repository/conversation/conversation_member_repository.js");
const conversationReadStateRepositoryModule = require("../dist/server/src/repository/conversation/conversation_read_state_repository.js");
const conversationServiceModule = require("../dist/server/src/service/conversation/conversation_profile_service.js");
const pgModule = require("../dist/server/src/db/pg.js");
const redisModule = require("../dist/server/src/cache/redis.js");
const wsModule = require("../dist/server/src/websocket/index.js");

const ConversationCoreRepository = conversationCoreRepositoryModule.default;
const ConversationMemberRepository = conversationMemberRepositoryModule.default;
const ConversationReadStateRepository =
  conversationReadStateRepositoryModule.default;
const ConversationService = conversationServiceModule.default;
const pg = pgModule.default;
const redis = redisModule.getRedis();
const { wsServer } = wsModule;

const originals = {
  tx: pg.tx,
  findById: ConversationCoreRepository.findById,
  findMember: ConversationMemberRepository.findMember,
  findMembersByConversation:
    ConversationMemberRepository.findMembersByConversation,
  updateConversationSettings:
    ConversationCoreRepository.updateConversationSettings,
  nextConversationSequence: ConversationCoreRepository.nextConversationSequence,
  insertSystemMessage: ConversationCoreRepository.insertSystemMessage,
  updateConversationPointers:
    ConversationCoreRepository.updateConversationPointers,
  upsertConversationUserStates:
    ConversationReadStateRepository.upsertConversationUserStates
};

const outboxRepoModule = require("../dist/server/src/repository/outbox_repository.js");
const OutboxRepository = outboxRepoModule.default;
const originalInsertEvents = OutboxRepository.insertEvents;

test.afterEach(() => {
  pg.tx = originals.tx;
  ConversationCoreRepository.findById = originals.findById;
  ConversationMemberRepository.findMember = originals.findMember;
  ConversationMemberRepository.findMembersByConversation =
    originals.findMembersByConversation;
  ConversationCoreRepository.updateConversationSettings =
    originals.updateConversationSettings;
  ConversationCoreRepository.nextConversationSequence =
    originals.nextConversationSequence;
  ConversationCoreRepository.insertSystemMessage =
    originals.insertSystemMessage;
  ConversationCoreRepository.updateConversationPointers =
    originals.updateConversationPointers;
  ConversationReadStateRepository.upsertConversationUserStates =
    originals.upsertConversationUserStates;
  OutboxRepository.insertEvents = originalInsertEvents;
});

test.after(() => {
  try {
    redis.disconnect();
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
});

function installGroupContext({
  conversationId = "888",
  actorUserId = 1,
  actorRole = 2,
  settings = {}
} = {}) {
  pg.tx = async callback => callback({});
  ConversationCoreRepository.findById = async () => ({
    id: conversationId,
    type: 2,
    settings
  });
  ConversationMemberRepository.findMember = async (_t, _cid, userId) => ({
    user_id: userId,
    role: actorRole,
    nickname: "tester"
  });
  ConversationMemberRepository.findMembersByConversation = async () => [
    { user_id: actorUserId, role: actorRole, nickname: "tester" }
  ];
  ConversationCoreRepository.updateConversationPointers = async () => undefined;
  ConversationReadStateRepository.upsertConversationUserStates = async () =>
    undefined;
  OutboxRepository.insertEvents = async () => undefined;
}

test("updateConversationAnnouncement is a no-op when announcement is unchanged", async () => {
  installGroupContext({
    settings: { announcement: "hello world" }
  });

  let writeCalled = false;
  let systemMessageCalled = false;
  ConversationCoreRepository.updateConversationSettings = async () => {
    writeCalled = true;
    return { id: "888", settings: {} };
  };
  ConversationCoreRepository.nextConversationSequence = async () => 1;
  ConversationCoreRepository.insertSystemMessage = async () => {
    systemMessageCalled = true;
    return { id: 1, sequence: 1, created_at: new Date() };
  };

  const result = await ConversationService.updateConversationAnnouncement(
    1,
    "888",
    "  hello world  " // same content with surrounding whitespace
  );

  assert.equal(writeCalled, false, "should not write DB when unchanged");
  assert.equal(
    systemMessageCalled,
    false,
    "should not emit a system message when unchanged"
  );
  assert.deepEqual(result.messages, []);
});

test("updateConversationSettings only writes a patch (changed fields)", async () => {
  installGroupContext({
    settings: {
      mute_all: false,
      invite_permission: "admins_only",
      profile_edit_permission: "admins"
    }
  });

  let capturedPatch = null;
  ConversationCoreRepository.updateConversationSettings = async (
    _t,
    params
  ) => {
    capturedPatch = params.settings;
    return {
      id: "888",
      settings: { ...params.settings }
    };
  };
  ConversationCoreRepository.nextConversationSequence = async () => 1;
  ConversationCoreRepository.insertSystemMessage = async () => ({
    id: 1,
    sequence: 1,
    created_at: new Date()
  });

  await ConversationService.updateConversationSettings(1, "888", {
    mute_all: true,
    invite_permission: "admins_only", // unchanged
    profile_edit_permission: "admins" // unchanged
  });

  assert.deepEqual(
    capturedPatch,
    { mute_all: true },
    "patch should contain only the changed field, preserving other JSONB fields via DB merge"
  );
});

test("updateConversationSettings is a no-op when no field changes", async () => {
  installGroupContext({
    settings: {
      mute_all: true,
      invite_permission: "admins_only",
      profile_edit_permission: "admins"
    }
  });

  let writeCalled = false;
  ConversationCoreRepository.updateConversationSettings = async () => {
    writeCalled = true;
    return { id: "888", settings: {} };
  };

  const result = await ConversationService.updateConversationSettings(
    1,
    "888",
    { mute_all: true } // already true
  );

  assert.equal(writeCalled, false);
  assert.deepEqual(result.messages, []);
});
