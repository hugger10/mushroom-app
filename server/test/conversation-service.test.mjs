import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const conversationCoreRepositoryModule = require("../dist/server/src/repository/conversation/conversation_core_repository.js");
const userRepositoryModule = require("../dist/server/src/repository/user_repository.js");
const conversationServiceModule = require("../dist/server/src/service/conversation/conversation_lifecycle_service.js");
const pgModule = require("../dist/server/src/db/pg.js");
const redisModule = require("../dist/server/src/cache/redis.js");
const wsModule = require("../dist/server/src/websocket/index.js");

const ConversationCoreRepository = conversationCoreRepositoryModule.default;
const UserRepository = userRepositoryModule.default;
const ConversationService = conversationServiceModule.default;
const pg = pgModule.default;
const redis = redisModule.getRedis();
const { wsServer } = wsModule;

const originals = {
  tx: pg.tx,
  findProfilesByIds: UserRepository.findProfilesByIds,
  insertConversation: ConversationCoreRepository.insertConversation
};

test.afterEach(() => {
  pg.tx = originals.tx;
  UserRepository.findProfilesByIds = originals.findProfilesByIds;
  ConversationCoreRepository.insertConversation = originals.insertConversation;
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

test("createConversation rejects nonexistent member users before inserting", async () => {
  let insertCalled = false;

  pg.tx = async callback => callback({});
  UserRepository.findProfilesByIds = async () => [
    {
      id: 1001,
      username: "alice",
      nickname: "Alice",
      gender: 0
    }
  ];
  ConversationCoreRepository.insertConversation = async () => {
    insertCalled = true;
    throw new Error("insertConversation should not be called");
  };

  await assert.rejects(
    () =>
      ConversationService.createConversation(
        {
          type: 2,
          name: "Team",
          owner_id: 1001
        },
        [
          {
            user_id: 1001,
            role: 2
          },
          {
            user_id: 9999,
            role: 0
          }
        ]
      ),
    /Some users do not exist/
  );

  assert.equal(insertCalled, false);
});
