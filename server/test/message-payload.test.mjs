import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { mapMessages } = require("../dist/server/src/utils/mapper.js");
const {
  toRemoteConversation,
  toRemoteMessage
} = require("../dist/server/src/utils/dto.js");

test("mapMessages keeps ids and normalizes string content for outbox delivery", () => {
  const payload = mapMessages({
    id: "msg-1",
    client_message_id: "client-1",
    conversation_id: 42,
    sender_id: 7,
    type: 1,
    content: '{"text":"hello"}',
    created_at: new Date("2026-03-12T10:00:00.000Z"),
    sequence: 9,
    client_conversation_id: "local-conv-1"
  });

  assert.equal(payload.messageClassify, "chat");
  assert.equal(payload.server_message_id, "msg-1");
  assert.equal(payload.client_message_id, "client-1");
  assert.equal(payload.client_conversation_id, "local-conv-1");
  assert.equal(payload.server_conversation_id, 42);
  assert.equal(payload.sequence, 9);
  assert.deepEqual(payload.content, { text: "hello" });
});

test("toRemoteMessage drops null client_message_id and preserves sequence", () => {
  const payload = toRemoteMessage({
    id: "msg-2",
    client_message_id: null,
    conversation_id: 84,
    sender_id: 8,
    type: 1,
    content: "plain-text",
    created_at: "2026-03-12T10:01:00.000Z",
    updated_at: "2026-03-12T10:01:00.000Z",
    sequence: 12
  });

  assert.equal(payload.id, "msg-2");
  assert.equal(payload.client_message_id, undefined);
  assert.equal(payload.sequence, 12);
  assert.deepEqual(payload.content, { text: "plain-text" });
});

test("toRemoteConversation preserves conversation user state fields", () => {
  const payload = toRemoteConversation({
    id: 9,
    type: 2,
    name: "项目群",
    owner_id: 7,
    peer_id: 0,
    last_message_content: '{"text":"hello"}',
    last_message_time: "2026-03-12T10:02:00.000Z",
    last_message_send_id: 8,
    unread_count: 3,
    last_sync_sequence: 12,
    last_read_sequence: 11,
    is_pinned: true,
    is_muted: false,
    is_archived: true,
    draft: "待补一条消息",
    description: "讨论产品需求",
    settings: '{"theme":"default"}',
    updated_at: "2026-03-12T10:03:00.000Z"
  });

  assert.equal(payload.id, 9);
  assert.equal(payload.type, 2);
  assert.deepEqual(payload.last_message_content, { text: "hello" });
  assert.equal(payload.is_pinned, 1);
  assert.equal(payload.is_muted, 0);
  assert.equal(payload.is_archived, 1);
  assert.equal(payload.draft, "待补一条消息");
  assert.equal(payload.last_sync_sequence, 12);
  assert.equal(payload.last_read_sequence, 11);
});

test("toRemoteMessage builds reply preview from plain string content", () => {
  const payload = toRemoteMessage({
    id: "msg-3",
    client_message_id: "client-3",
    conversation_id: 84,
    reply_to_message_id: "msg-1",
    reply_to_sender_id: 7,
    reply_to_sender_nickname: "小陈",
    reply_to_content: "原始纯文本回复",
    sender_id: 8,
    type: 1,
    content: '{"text":"收到"}',
    created_at: "2026-03-12T10:01:00.000Z",
    updated_at: "2026-03-12T10:05:00.000Z",
    sequence: 13,
    is_recalled: 1
  });

  assert.equal(payload.reply_to_message_id, "msg-1");
  assert.deepEqual(payload.reply_to, {
    message_id: "msg-1",
    sender_id: 7,
    sender_nickname: "小陈",
    text: "原始纯文本回复"
  });
  assert.equal(payload.is_recalled, 1);
  assert.equal(payload.updated_at, "2026-03-12T10:05:00.000Z");
});

test("mapMessages supports arrays and preserves reply payloads", () => {
  const payload = mapMessages([
    {
      id: "msg-4",
      client_message_id: "client-4",
      conversation_id: 99,
      sender_id: 10,
      type: 1,
      content: '{"text":"第一条"}',
      created_at: new Date("2026-03-12T10:10:00.000Z"),
      sequence: 21,
      client_conversation_id: "local-conv-9"
    },
    {
      id: "msg-5",
      client_message_id: "client-5",
      conversation_id: 99,
      reply_to_message_id: "msg-4",
      reply_to_sender_id: 10,
      reply_to_sender_nickname: "阿杰",
      reply_to_content: '{"text":"第一条"}',
      sender_id: 11,
      type: 1,
      content: '{"text":"第二条"}',
      created_at: new Date("2026-03-12T10:11:00.000Z"),
      updated_at: new Date("2026-03-12T10:12:00.000Z"),
      sequence: 22,
      client_conversation_id: "local-conv-9"
    }
  ]);

  assert.equal(Array.isArray(payload), true);
  assert.equal(payload.length, 2);
  assert.equal(payload[1].sequence, 22);
  assert.deepEqual(payload[1].reply_to, {
    message_id: "msg-4",
    sender_id: 10,
    sender_nickname: "阿杰",
    text: "第一条"
  });
  assert.equal(payload[1].updated_at, "2026-03-12T10:12:00.000Z");
});
