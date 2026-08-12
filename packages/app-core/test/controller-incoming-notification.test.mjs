// Integration test for MobileAppController.onIncomingChatMessage hook.
//
// Verifies that the realtime chat path fires the host-provided
// notification dispatcher exactly when expected:
//   - incoming, non-duplicate message → dispatcher invoked
//   - outgoing (self) message → dispatcher NOT invoked
//   - duplicate inbound message → dispatcher NOT invoked
//   - dispatcher error is swallowed and does not break the pipeline

import { test } from "node:test";
import { strict as assert } from "node:assert";

import {
  createMobileAppController,
  createJsonBackedAuthSessionStore,
  createJsonBackedSyncCheckpointStore,
  createJsonBackedMobileDataRepository
} from "../src/index.ts";

function createInMemoryStorage() {
  const map = new Map();
  return {
    getItem: key => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: key => {
      map.delete(key);
    }
  };
}

async function buildController({ onIncomingChatMessage } = {}) {
  const storage = createInMemoryStorage();
  const authStore = createJsonBackedAuthSessionStore({ storage });
  const checkpoints = createJsonBackedSyncCheckpointStore({ storage });
  const repository = createJsonBackedMobileDataRepository({ storage });

  // Seed an authenticated user.
  await authStore.write({
    accessToken: "test-token",
    refreshToken: null,
    user: {
      userId: 100,
      nickname: "self",
      username: "self",
      avatar: ""
    },
    profile: null
  });

  // Seed a direct conversation (type=1) bound to server id "c-1".
  await repository.upsertConversations([
    {
      client_conversation_id: "ccid-1",
      server_conversation_id: "c-1",
      type: 1,
      name: "Friend",
      owner_id: 0,
      peer_id: 200,
      last_message_send_id: 0,
      last_message_content: {},
      last_message_time: "",
      unread_count: 0,
      last_sync_sequence: 0,
      last_read_sequence: 0,
      status: 0,
      is_pinned: 0,
      is_muted: 0
    }
  ]);

  // Stub api — handleRealtimeChatMessage doesn't call api directly.
  const api = new Proxy(
    {},
    {
      get() {
        return async () => {
          throw new Error("api should not be called in this test");
        };
      }
    }
  );

  const controller = createMobileAppController({
    api,
    authStore,
    checkpoints,
    repository,
    deviceInfo: {
      deviceId: "dev-1",
      deviceType: 0,
      deviceName: "test"
    },
    onIncomingChatMessage
  });

  return { controller, repository };
}

function makeIncomingChatMessage(overrides = {}) {
  return {
    messageClassify: "chat",
    client_message_id: "cmid-1",
    server_message_id: "smid-1",
    client_conversation_id: "ccid-1",
    server_conversation_id: "c-1",
    type: 1,
    status: 0,
    retry_count: 0,
    next_retry_at: null,
    last_error: null,
    sequence: 1,
    content: { type: 1, text: "hello there" },
    sender_id: 200,
    sender_nickname: "Friend",
    sender_avatar: "",
    created_at: new Date().toISOString(),
    is_recalled: 0,
    is_favorited: 0,
    is_pinned: 0,
    reply_to_message_id: null,
    reply_to: null,
    forward_from: null,
    ...overrides
  };
}

test("onIncomingChatMessage fires for an incoming chat message", async () => {
  const calls = [];
  const { controller } = await buildController({
    onIncomingChatMessage: ctx => {
      calls.push(ctx);
    }
  });

  await controller.handleRealtimeEvent(makeIncomingChatMessage());

  assert.equal(calls.length, 1);
  const ctx = calls[0];
  assert.equal(ctx.message.server_message_id, "smid-1");
  assert.equal(ctx.conversation.client_conversation_id, "ccid-1");
  assert.equal(ctx.isActiveConversation, false);
  assert.equal(ctx.isMentioned, false);
  assert.equal(ctx.isDuplicate, false);
});

test("onIncomingChatMessage does NOT fire for own (outgoing) chat", async () => {
  const calls = [];
  const { controller } = await buildController({
    onIncomingChatMessage: ctx => {
      calls.push(ctx);
    }
  });

  await controller.handleRealtimeEvent(
    makeIncomingChatMessage({
      sender_id: 100, // current user
      server_message_id: "smid-self"
    })
  );

  assert.equal(calls.length, 0);
});

test("onIncomingChatMessage does NOT fire for duplicate inbound", async () => {
  const calls = [];
  const { controller } = await buildController({
    onIncomingChatMessage: ctx => {
      calls.push(ctx);
    }
  });

  const first = makeIncomingChatMessage();
  await controller.handleRealtimeEvent(first);
  await controller.handleRealtimeEvent(first);

  assert.equal(calls.length, 1, "second delivery is deduped by controller");
});

test("onIncomingChatMessage error is swallowed", async () => {
  let attempts = 0;
  const { controller } = await buildController({
    onIncomingChatMessage: () => {
      attempts += 1;
      throw new Error("boom");
    }
  });

  // Should not reject.
  await controller.handleRealtimeEvent(makeIncomingChatMessage());
  assert.equal(attempts, 1);
});

test("controller works without onIncomingChatMessage (back-compat)", async () => {
  const { controller, repository } = await buildController({
    onIncomingChatMessage: undefined
  });

  await controller.handleRealtimeEvent(makeIncomingChatMessage());

  // Message persisted regardless of dispatcher.
  const messages = await repository.listMessages("ccid-1");
  assert.equal(messages.length, 1);
  assert.equal(messages[0].server_message_id, "smid-1");
});
