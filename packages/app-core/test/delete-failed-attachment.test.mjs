// Tests for MobileAppController.deleteFailedLocalAttachmentMessage —
// 失败态附件草稿的"无确认删除"流程，对齐 WhatsApp 长按 → 删除 语义。

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

function makeAttachmentStore() {
  const deleted = [];
  return {
    store: {
      async persist() {
        return "";
      },
      async get() {
        return null;
      },
      async delete(ref) {
        deleted.push(ref);
      },
      async release() {
        // not used here
      },
      async sweep() {
        // not used here
      }
    },
    deleted
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

function makeAttachmentMessage(overrides = {}) {
  return {
    client_message_id: "cmid-att-1",
    client_conversation_id: "ccid-1",
    server_conversation_id: "c-1",
    server_message_id: null,
    type: 2,
    status: -1,
    retry_count: 0,
    next_retry_at: null,
    last_error: "send failed",
    sequence: 0,
    content: {
      type: 2,
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

test("deleteFailedLocalAttachmentMessage removes failed message + both refs", async () => {
  const { store, deleted } = makeAttachmentStore();
  const { controller, repository } = await buildController({
    attachmentStore: store
  });
  await repository.upsertMessages([makeAttachmentMessage()]);

  const result = await controller.deleteFailedLocalAttachmentMessage({
    clientConversationId: "ccid-1",
    clientMessageId: "cmid-att-1"
  });

  assert.equal(result.deleted, true);
  assert.deepEqual(result.refs.sort(), [
    "outbox://cmid-att-1/preview",
    "outbox://cmid-att-1/source"
  ]);
  // attachmentStore.delete 被两个 ref 都调用过。
  assert.equal(deleted.length, 2);
  assert.equal(deleted.includes("outbox://cmid-att-1/source"), true);
  assert.equal(deleted.includes("outbox://cmid-att-1/preview"), true);
  // 仓库中 cmid 已不存在。
  const remaining = await repository.listMessages("ccid-1");
  assert.equal(remaining.length, 0);
});

test("deleteFailedLocalAttachmentMessage no-ops on ACKed message (status=2)", async () => {
  const { store, deleted } = makeAttachmentStore();
  const { controller, repository } = await buildController({
    attachmentStore: store
  });
  await repository.upsertMessages([
    makeAttachmentMessage({ status: 2, server_message_id: "smid-1" })
  ]);

  const result = await controller.deleteFailedLocalAttachmentMessage({
    clientConversationId: "ccid-1",
    clientMessageId: "cmid-att-1"
  });

  assert.equal(result.deleted, false);
  assert.equal(deleted.length, 0);
  // 消息行未被删除。
  const remaining = await repository.listMessages("ccid-1");
  assert.equal(remaining.length, 1);
});

test("deleteFailedLocalAttachmentMessage no-ops on status:-1 already on-chain", async () => {
  // 防御性：失败但携带 server_message_id 的消息（理论上应该被回滚清掉，
  // 但实际可能发生 race），仍然不允许通过这个入口被删，避免误删服务端有据
  // 可查的消息。
  const { store, deleted } = makeAttachmentStore();
  const { controller, repository } = await buildController({
    attachmentStore: store
  });
  await repository.upsertMessages([
    makeAttachmentMessage({ status: -1, server_message_id: "smid-1" })
  ]);

  const result = await controller.deleteFailedLocalAttachmentMessage({
    clientConversationId: "ccid-1",
    clientMessageId: "cmid-att-1"
  });

  assert.equal(result.deleted, false);
  assert.equal(deleted.length, 0);
  const remaining = await repository.listMessages("ccid-1");
  assert.equal(remaining.length, 1);
});

test("deleteFailedLocalAttachmentMessage tolerates missing local_source_ref", async () => {
  // 上传成功 → WS 失败 → 此时 local_source_ref 已被 ACK 释放，
  // 但仍可能保留 local_preview_ref。删除流程必须仍能正常完成。
  const { store, deleted } = makeAttachmentStore();
  const { controller, repository } = await buildController({
    attachmentStore: store
  });
  await repository.upsertMessages([
    makeAttachmentMessage({
      content: {
        type: 2,
        local_preview_ref: "outbox://cmid-att-1/preview",
        original_file_name: "photo.jpg",
        original_file_size: 1024
      }
    })
  ]);

  const result = await controller.deleteFailedLocalAttachmentMessage({
    clientConversationId: "ccid-1",
    clientMessageId: "cmid-att-1"
  });

  assert.equal(result.deleted, true);
  assert.deepEqual(result.refs, ["outbox://cmid-att-1/preview"]);
  assert.equal(deleted.length, 1);
  const remaining = await repository.listMessages("ccid-1");
  assert.equal(remaining.length, 0);
});
