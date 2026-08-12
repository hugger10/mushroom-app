import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const messageServiceModule = require("../dist/server/src/service/message_service.js");
const messageRepositoryModule = require("../dist/server/src/repository/message_repository.js");
const attachmentRepositoryModule = require("../dist/server/src/repository/attachment_repository.js");
const messageReactionRepositoryModule = require("../dist/server/src/repository/message_reaction_repository.js");

const MessageService = messageServiceModule.default;
const MessageRepository = messageRepositoryModule.default;
const AttachmentRepository = attachmentRepositoryModule.default;
const MessageReactionRepository = messageReactionRepositoryModule.default;

const originals = {
  listMessages: MessageRepository.listMessages,
  listMessagesAround: MessageRepository.listMessagesAround,
  findMessageDelta: MessageRepository.findMessageDelta,
  getVisibleFromSequence: MessageRepository.getVisibleFromSequence,
  loadAttachmentsByMessageIds: AttachmentRepository.loadAttachmentsByMessageIds,
  findActiveByMessageIds: MessageReactionRepository.findActiveByMessageIds
};

test.afterEach(() => {
  MessageRepository.listMessages = originals.listMessages;
  MessageRepository.listMessagesAround = originals.listMessagesAround;
  MessageRepository.findMessageDelta = originals.findMessageDelta;
  MessageRepository.getVisibleFromSequence = originals.getVisibleFromSequence;
  AttachmentRepository.loadAttachmentsByMessageIds =
    originals.loadAttachmentsByMessageIds;
  MessageReactionRepository.findActiveByMessageIds =
    originals.findActiveByMessageIds;
});

function buildRow(seq) {
  return {
    id: `msg-${seq}`,
    client_message_id: `c-${seq}`,
    conversation_id: "10",
    reply_to_message_id: null,
    sender_id: 1,
    type: "text",
    content: { text: `t-${seq}` },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    sequence: seq,
    is_recalled: false,
    is_favorited: false,
    is_pinned: false,
    client_conversation_id: "client-10"
  };
}

function stubExternal() {
  AttachmentRepository.loadAttachmentsByMessageIds = async () => new Map();
  MessageReactionRepository.findActiveByMessageIds = async () => [];
}

test("listMessages returns reached_history_start=true for direct chat at seq 1", async () => {
  stubExternal();
  MessageRepository.listMessages = async () => [buildRow(1), buildRow(2)];
  MessageRepository.getVisibleFromSequence = async () => 1;

  const result = await MessageService.listMessages(
    {
      conversationId: "10",
      clientConversationId: "client-10",
      limit: 50
    },
    7
  );

  assert.equal(result.has_more, false);
  assert.equal(result.loaded_from_sequence, 1);
  assert.equal(result.visible_from_sequence, 1);
  assert.equal(result.reached_history_start, true);
});

test("listMessages stays reached_history_start=false when has_more=true", async () => {
  stubExternal();
  // 51 rows triggers has_more=true (limit+1 sentinel)
  const rows = [];
  for (let seq = 5; seq <= 55; seq += 1) {
    rows.push(buildRow(seq));
  }
  MessageRepository.listMessages = async () => rows;
  MessageRepository.getVisibleFromSequence = async () => 1;

  const result = await MessageService.listMessages(
    {
      conversationId: "10",
      clientConversationId: "client-10",
      limit: 50
    },
    7
  );

  assert.equal(result.has_more, true);
  assert.equal(result.reached_history_start, false);
  assert.equal(result.visible_from_sequence, 1);
});

test("listMessages converges reached_history_start for group member join boundary", async () => {
  stubExternal();
  // member joined at seq=100, last page returns 100..120, no older
  const rows = [];
  for (let seq = 100; seq <= 120; seq += 1) {
    rows.push(buildRow(seq));
  }
  MessageRepository.listMessages = async () => rows;
  MessageRepository.getVisibleFromSequence = async () => 100;

  const result = await MessageService.listMessages(
    {
      conversationId: "10",
      clientConversationId: "client-10",
      limit: 50
    },
    7
  );

  assert.equal(result.has_more, false);
  assert.equal(result.loaded_from_sequence, 100);
  assert.equal(result.visible_from_sequence, 100);
  assert.equal(result.reached_history_start, true);
});

test("listMessages handles empty conversation as reached_history_start=true", async () => {
  stubExternal();
  MessageRepository.listMessages = async () => [];
  MessageRepository.getVisibleFromSequence = async () => 0;

  const result = await MessageService.listMessages(
    {
      conversationId: "10",
      clientConversationId: "client-10",
      limit: 50
    },
    7
  );

  assert.equal(result.has_more, false);
  assert.equal(result.messages.length, 0);
  assert.equal(result.reached_history_start, true);
  assert.equal(result.visible_from_sequence, 0);
});

test("getMessageDelta includes visible_from_sequence", async () => {
  stubExternal();
  MessageRepository.findMessageDelta = async () => [buildRow(11), buildRow(12)];
  MessageRepository.getVisibleFromSequence = async () => 5;

  const result = await MessageService.getMessageDelta(
    {
      conversationId: "10",
      clientConversationId: "client-10",
      afterSequence: 10,
      limit: 100
    },
    7
  );

  assert.equal(result.visible_from_sequence, 5);
  assert.equal(result.has_more, false);
  assert.equal(result.next_after_sequence, 12);
});

test("listMessagesAround reports reached_history_start when window covers start", async () => {
  stubExternal();
  MessageRepository.listMessagesAround = async () => [
    buildRow(1),
    buildRow(2),
    buildRow(3)
  ];
  MessageRepository.getVisibleFromSequence = async () => 1;

  const result = await MessageService.listMessagesAround(
    {
      conversationId: "10",
      clientConversationId: "client-10",
      pivotSequence: 2,
      limit: 10
    },
    7
  );

  assert.equal(result.reached_history_start, true);
  assert.equal(result.visible_from_sequence, 1);
});

test("listMessagesAround stays false when window does not reach visible start", async () => {
  stubExternal();
  MessageRepository.listMessagesAround = async () => [
    buildRow(50),
    buildRow(51),
    buildRow(52)
  ];
  MessageRepository.getVisibleFromSequence = async () => 10;

  const result = await MessageService.listMessagesAround(
    {
      conversationId: "10",
      clientConversationId: "client-10",
      pivotSequence: 51,
      limit: 10
    },
    7
  );

  assert.equal(result.reached_history_start, false);
  assert.equal(result.visible_from_sequence, 10);
});
