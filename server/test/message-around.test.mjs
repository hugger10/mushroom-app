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
  listMessagesAround: MessageRepository.listMessagesAround,
  loadAttachmentsByMessageIds: AttachmentRepository.loadAttachmentsByMessageIds,
  findActiveByMessageIds: MessageReactionRepository.findActiveByMessageIds
};

test.afterEach(() => {
  MessageRepository.listMessagesAround = originals.listMessagesAround;
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

test("listMessagesAround returns ordered window and clamps limit", async () => {
  let captured = null;
  MessageRepository.listMessagesAround = async params => {
    captured = params;
    return [buildRow(8), buildRow(10), buildRow(12), buildRow(9), buildRow(11)];
  };
  AttachmentRepository.loadAttachmentsByMessageIds = async () => new Map();
  MessageReactionRepository.findActiveByMessageIds = async () => [];

  const result = await MessageService.listMessagesAround(
    {
      conversationId: "10",
      clientConversationId: "client-10",
      pivotSequence: 10,
      limit: 5
    },
    7
  );

  assert.equal(captured.userId, 7);
  assert.equal(captured.pivotSequence, 10);
  assert.equal(captured.limit, 5);
  assert.deepEqual(
    result.messages.map(m => Number(m.sequence)),
    [8, 9, 10, 11, 12]
  );
  assert.equal(result.has_more, false);
  assert.equal(result.loaded_from_sequence, 8);
  assert.equal(result.loaded_to_sequence, 12);
});

test("listMessagesAround clamps limit to >=2 and <=200", async () => {
  let captured = null;
  MessageRepository.listMessagesAround = async params => {
    captured = params;
    return [];
  };
  AttachmentRepository.loadAttachmentsByMessageIds = async () => new Map();
  MessageReactionRepository.findActiveByMessageIds = async () => [];

  await MessageService.listMessagesAround(
    {
      conversationId: "1",
      clientConversationId: "c-1",
      pivotSequence: 0,
      limit: 1
    },
    1
  );
  assert.equal(captured.limit, 2);

  await MessageService.listMessagesAround(
    {
      conversationId: "1",
      clientConversationId: "c-1",
      pivotSequence: 0,
      limit: 9999
    },
    1
  );
  assert.equal(captured.limit, 200);
});
