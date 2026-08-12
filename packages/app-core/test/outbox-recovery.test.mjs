// Tests for outbox / startup-recovery related controller surface:
//   - markAttachmentLocalSourceMissing → status -1 + content.local_source_missing
//   - runStartupRecovery → status:1 outgoing attachment is parked to -1,
//     missing ref triggers local_source_missing, orphan sweep is invoked.

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

function makeAttachmentStore({ existingRefs = new Set() } = {}) {
  const swept = [];
  const released = [];
  return {
    store: {
      async persist() {
        return "";
      },
      async get(ref) {
        return existingRefs.has(ref)
          ? { mimeType: "image/jpeg", size: 1, blob: null, uri: ref }
          : null;
      },
      async release(ref) {
        released.push(ref);
      },
      async sweep(activeRefs) {
        swept.push(new Set(activeRefs));
      }
    },
    swept,
    released
  };
}

async function buildController({ attachmentStore } = {}) {
  const storage = createInMemoryStorage();
  const authStore = createJsonBackedAuthSessionStore({ storage });
  const checkpoints = createJsonBackedSyncCheckpointStore({ storage });
  const repository = createJsonBackedMobileDataRepository({ storage });

  await authStore.write({
    accessToken: "test-token",
    refreshToken: null,
    user: { userId: 100, nickname: "self", username: "self", avatar: "" },
    profile: null
  });

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
    attachmentStore,
    deviceInfo: { deviceId: "dev-1", deviceType: 0, deviceName: "test" }
  });

  return { controller, repository };
}

function makeOutgoingAttachmentMessage(overrides = {}) {
  return {
    client_message_id: "cmid-att-1",
    client_conversation_id: "ccid-1",
    server_conversation_id: "c-1",
    type: 2,
    status: 1,
    retry_count: 0,
    next_retry_at: null,
    last_error: null,
    sequence: 0,
    content: {
      type: 2,
      upload_pending: true,
      upload_progress: 42,
      local_source_ref: "outbox://cmid-att-1/source",
      local_preview_ref: "outbox://cmid-att-1/preview",
      original_file_name: "photo.jpg",
      original_file_size: 1024
    },
    sender_id: 100,
    sender_nickname: "self",
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

test("markAttachmentLocalSourceMissing sets status -1 + local_source_missing", async () => {
  const { controller, repository } = await buildController();
  await repository.upsertMessages([makeOutgoingAttachmentMessage()]);

  await controller.markAttachmentLocalSourceMissing({
    clientConversationId: "ccid-1",
    clientMessageId: "cmid-att-1"
  });

  const [msg] = await repository.listMessages("ccid-1");
  assert.equal(msg.status, -1);
  assert.equal(msg.content.local_source_missing, true);
  // upload_pending 现在改为 delete（而非置 false），与 startup-recovery 一致。
  assert.equal(msg.content.upload_pending, undefined);
});

test("runStartupRecovery parks status:1 -> -1 and clears upload_pending", async () => {
  const { store, swept } = makeAttachmentStore({
    existingRefs: new Set([
      "outbox://cmid-att-1/source",
      "outbox://cmid-att-1/preview"
    ])
  });
  const { controller, repository } = await buildController({
    attachmentStore: store
  });
  await repository.upsertMessages([makeOutgoingAttachmentMessage()]);

  await controller.runStartupRecovery();

  const [msg] = await repository.listMessages("ccid-1");
  assert.equal(msg.status, -1, "interrupted send is parked to failed");
  assert.equal(msg.content.upload_pending, false);
  assert.equal(msg.content.upload_progress, undefined);
  // refs still valid → not marked missing
  assert.notEqual(msg.content.local_source_missing, true);

  // sweep called with active refs (currently still referenced).
  assert.equal(swept.length, 1);
  assert.equal(swept[0].has("outbox://cmid-att-1/source"), true);
  assert.equal(swept[0].has("outbox://cmid-att-1/preview"), true);
});

test("runStartupRecovery marks local_source_missing when ref gone", async () => {
  const { store } = makeAttachmentStore({ existingRefs: new Set() });
  const { controller, repository } = await buildController({
    attachmentStore: store
  });
  await repository.upsertMessages([
    makeOutgoingAttachmentMessage({ status: -1 })
  ]);

  await controller.runStartupRecovery();

  const [msg] = await repository.listMessages("ccid-1");
  assert.equal(msg.status, -1);
  assert.equal(msg.content.local_source_missing, true);
});

test("markAttachmentLocalSourceMissing also clears upload_progress + upload_error", async () => {
  const { controller, repository } = await buildController();
  await repository.upsertMessages([
    makeOutgoingAttachmentMessage({
      content: {
        type: 2,
        upload_pending: true,
        upload_progress: 42,
        upload_error: "stale-error",
        local_source_ref: "outbox://cmid-att-1/source",
        local_preview_ref: "outbox://cmid-att-1/preview",
        original_file_name: "photo.jpg",
        original_file_size: 1024
      }
    })
  ]);

  await controller.markAttachmentLocalSourceMissing({
    clientConversationId: "ccid-1",
    clientMessageId: "cmid-att-1"
  });

  const [msg] = await repository.listMessages("ccid-1");
  assert.equal(msg.status, -1);
  assert.equal(msg.content.local_source_missing, true);
  // 全部 upload_* 字段都应被清掉，避免 UI 仍以为在传输或残留旧错误提示。
  assert.equal(msg.content.upload_pending, undefined);
  assert.equal(msg.content.upload_progress, undefined);
  assert.equal(msg.content.upload_error, undefined);
});

test("runStartupRecovery sweep retains refs from status:-1 messages (not just status:1)", async () => {
  // 失败态 status:-1 但仍持有本地 ref 的消息，sweep 必须把它们的 refs 视为
  // 活跃，否则用户气泡内"重试"会因本地源被误删而触发 local_source_missing。
  const { store, swept } = makeAttachmentStore({
    existingRefs: new Set([
      "outbox://cmid-att-1/source",
      "outbox://cmid-att-1/preview"
    ])
  });
  const { controller, repository } = await buildController({
    attachmentStore: store
  });
  await repository.upsertMessages([
    makeOutgoingAttachmentMessage({ status: -1 })
  ]);

  await controller.runStartupRecovery();

  assert.equal(swept.length, 1);
  assert.equal(swept[0].has("outbox://cmid-att-1/source"), true);
  assert.equal(swept[0].has("outbox://cmid-att-1/preview"), true);
});
