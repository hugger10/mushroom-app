import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const conversationControllerModule = require("../dist/server/src/controller/conversation_controller.js");
const conversationQueryServiceModule = require("../dist/server/src/service/conversation/conversation_query_service.js");
const conversationLifecycleServiceModule = require("../dist/server/src/service/conversation/conversation_lifecycle_service.js");
const redisModule = require("../dist/server/src/cache/redis.js");
const wsModule = require("../dist/server/src/websocket/index.js");

const { ConversationController } = conversationControllerModule;
const ConversationQueryService = conversationQueryServiceModule.default;
const ConversationLifecycleService = conversationLifecycleServiceModule.default;
const redis = redisModule.getRedis();
const { wsServer } = wsModule;

const originals = {
  createConversation: ConversationLifecycleService.createConversation,
  getConversationMembers: ConversationQueryService.getConversationMembers,
  dispatchToUser: wsServer.dispatchToUser
};

function createMockResponse() {
  return {
    headersSent: false,
    sentResult: undefined,
    sendResult(data) {
      this.sentResult = data;
    }
  };
}

async function runWrapped(handler, req) {
  const res = createMockResponse();
  let nextError = null;

  await handler(req, res, error => {
    nextError = error;
  });

  if (nextError) {
    throw nextError;
  }

  return res.sentResult;
}

async function cleanupRealtimeResources() {
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
}

test.afterEach(() => {
  ConversationLifecycleService.createConversation =
    originals.createConversation;
  ConversationQueryService.getConversationMembers =
    originals.getConversationMembers;
  wsServer.dispatchToUser = originals.dispatchToUser;
});

test.after(async () => {
  await cleanupRealtimeResources();
});

test("getMember rejects users that are not active conversation members", async () => {
  ConversationQueryService.getConversationMembers = async () => [
    {
      conversation_id: "conv-1",
      user_id: 1002,
      role: 0,
      nickname: "Bob",
      joined_at: new Date()
    }
  ];

  await assert.rejects(
    () =>
      runWrapped(ConversationController.getMember, {
        query: { conversationId: "conv-1" },
        JwtPayload: { userId: 1001 }
      }),
    /User is not an active member/
  );
});

test("create derives group ownership and roles from the authenticated user", async () => {
  let capturedConversation = null;
  let capturedMembers = null;
  const dispatchedUserIds = [];

  ConversationLifecycleService.createConversation = async (
    conversation,
    members
  ) => {
    capturedConversation = conversation;
    capturedMembers = members;
    return {
      id: "conv-1",
      type: conversation.type,
      name: conversation.name,
      owner_id: conversation.owner_id,
      created_at: new Date(),
      updated_at: new Date(),
      members
    };
  };
  wsServer.dispatchToUser = async userId => {
    dispatchedUserIds.push(userId);
  };

  const result = await runWrapped(ConversationController.create, {
    body: {
      conv: {
        type: 1,
        name: "Team",
        owner_id: 9999
      },
      members: [
        { user_id: 9999, role: 2, nickname: "Impersonated Owner" },
        { user_id: 1002, role: 2, nickname: "Bob" }
      ]
    },
    JwtPayload: { userId: 1001 }
  });

  assert.equal(capturedConversation.type, 2);
  assert.equal(capturedConversation.owner_id, 1001);
  assert.deepEqual(capturedMembers, [
    {
      user_id: 9999,
      role: 0,
      nickname: "Impersonated Owner"
    },
    {
      user_id: 1002,
      role: 0,
      nickname: "Bob"
    },
    {
      user_id: 1001,
      role: 2,
      nickname: undefined
    }
  ]);
  assert.deepEqual(dispatchedUserIds.sort(), [1001, 1002, 9999]);
  assert.equal(result.owner_id, 1001);
});
