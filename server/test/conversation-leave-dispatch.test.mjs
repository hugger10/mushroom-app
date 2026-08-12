import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const conversationControllerModule = require("../dist/server/src/controller/conversation_controller.js");
const conversationServiceModule = require("../dist/server/src/service/conversation/conversation_member_service.js");
const redisModule = require("../dist/server/src/cache/redis.js");
const wsModule = require("../dist/server/src/websocket/index.js");

const { ConversationController } = conversationControllerModule;
const ConversationService = conversationServiceModule.default;
const redis = redisModule.getRedis();
const { wsServer } = wsModule;

const originals = {
  leaveConversation: ConversationService.leaveConversation,
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
  ConversationService.leaveConversation = originals.leaveConversation;
  wsServer.dispatchToUser = originals.dispatchToUser;
});

test.after(async () => {
  await cleanupRealtimeResources();
});

test("leave dispatches conversation_sync upsert to remaining members and remove to the leaver", async () => {
  const leaverId = 1001;
  const remainingMemberId = 1002;
  const conversationId = "conv-leave-1";

  ConversationService.leaveConversation = async (userId, convId) => {
    assert.equal(userId, leaverId);
    assert.equal(convId, conversationId);
    return {
      conversation: {
        id: conversationId,
        type: 2,
        name: "Test Group",
        owner_id: remainingMemberId,
        created_at: new Date(),
        updated_at: new Date()
      },
      // Only the remaining active member after leave
      members: [
        {
          conversation_id: conversationId,
          user_id: remainingMemberId,
          role: 2,
          nickname: "Bob",
          joined_at: new Date()
        }
      ],
      messages: []
    };
  };

  const dispatches = [];
  wsServer.dispatchToUser = async (userId, message) => {
    dispatches.push({ userId, message });
  };

  const result = await runWrapped(ConversationController.leave, {
    body: { conversationId },
    JwtPayload: { userId: leaverId }
  });

  assert.equal(result.conversation_id, conversationId);

  const upserts = dispatches.filter(
    d =>
      d.message.messageClassify === "conversation_sync" &&
      d.message.action === "upsert"
  );
  const removes = dispatches.filter(
    d =>
      d.message.messageClassify === "conversation_sync" &&
      d.message.action === "remove"
  );

  // Remaining member receives upsert
  assert.equal(upserts.length, 1);
  assert.equal(upserts[0].userId, remainingMemberId);
  assert.equal(upserts[0].message.conversation_id, conversationId);

  // Leaver receives remove
  assert.equal(removes.length, 1);
  assert.equal(removes[0].userId, leaverId);
  assert.equal(removes[0].message.conversation_id, conversationId);
});

test("leave dispatch counts: N remaining members -> N upserts + 1 remove, no overlap", async () => {
  const leaverId = 1001;
  const remainingMemberIds = [1002, 1003];
  const conversationId = "conv-leave-2";

  ConversationService.leaveConversation = async () => ({
    conversation: {
      id: conversationId,
      type: 2,
      name: "Test Group 3p",
      owner_id: remainingMemberIds[0],
      created_at: new Date(),
      updated_at: new Date()
    },
    members: remainingMemberIds.map(uid => ({
      conversation_id: conversationId,
      user_id: uid,
      role: uid === remainingMemberIds[0] ? 2 : 0,
      nickname: `User${uid}`,
      joined_at: new Date()
    })),
    messages: []
  });

  const dispatches = [];
  wsServer.dispatchToUser = async (userId, message) => {
    dispatches.push({ userId, message });
  };

  await runWrapped(ConversationController.leave, {
    body: { conversationId },
    JwtPayload: { userId: leaverId }
  });

  // Total dispatches == remaining count + 1 (leaver)
  assert.equal(
    dispatches.length,
    remainingMemberIds.length + 1,
    `expected ${remainingMemberIds.length + 1} total dispatches, got ${dispatches.length}`
  );

  const upsertUserIds = dispatches
    .filter(
      d =>
        d.message.messageClassify === "conversation_sync" &&
        d.message.action === "upsert"
    )
    .map(d => d.userId)
    .sort((a, b) => a - b);
  const removeUserIds = dispatches
    .filter(
      d =>
        d.message.messageClassify === "conversation_sync" &&
        d.message.action === "remove"
    )
    .map(d => d.userId);

  // upsert set === remaining set; leaver MUST NOT be in upserts
  assert.deepEqual(
    upsertUserIds,
    [...remainingMemberIds].sort((a, b) => a - b)
  );
  assert.ok(
    !upsertUserIds.includes(leaverId),
    "leaver must not receive upsert"
  );

  // remove set === [leaverId]; no remaining member receives remove
  assert.deepEqual(removeUserIds, [leaverId]);
  for (const uid of remainingMemberIds) {
    assert.ok(
      !removeUserIds.includes(uid),
      `remaining member ${uid} must not receive remove`
    );
  }

  // All frames target the same conversation_id
  for (const d of dispatches) {
    assert.equal(d.message.conversation_id, conversationId);
  }
});
