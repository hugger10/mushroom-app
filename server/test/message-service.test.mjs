import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const messageServiceModule = require("../dist/server/src/service/message_service.js");
const conversationServiceModule = require("../dist/server/src/service/conversation/conversation_query_service.js");
const userRepositoryModule = require("../dist/server/src/repository/user_repository.js");
const conversationCoreRepositoryModule = require("../dist/server/src/repository/conversation/conversation_core_repository.js");
const conversationMemberRepositoryModule = require("../dist/server/src/repository/conversation/conversation_member_repository.js");
const conversationReadStateRepositoryModule = require("../dist/server/src/repository/conversation/conversation_read_state_repository.js");
const attachmentRepositoryModule = require("../dist/server/src/repository/attachment_repository.js");
const messageRepositoryModule = require("../dist/server/src/repository/message_repository.js");
const outboxRepositoryModule = require("../dist/server/src/repository/outbox_repository.js");
const pgModule = require("../dist/server/src/db/pg.js");
const wsModule = require("../dist/server/src/websocket/index.js");
const redisModule = require("../dist/server/src/cache/redis.js");

const MessageService = messageServiceModule.default;
const ConversationService = conversationServiceModule.default;
const UserRepository = userRepositoryModule.default;
const ConversationCoreRepository = conversationCoreRepositoryModule.default;
const ConversationMemberRepository = conversationMemberRepositoryModule.default;
const ConversationReadStateRepository =
  conversationReadStateRepositoryModule.default;
const AttachmentRepository = attachmentRepositoryModule.default;
const MessageRepository = messageRepositoryModule.default;
const OutboxRepository = outboxRepositoryModule.default;
const pg = pgModule.default;
const { wsServer } = wsModule;
const redis = redisModule.getRedis();

const originals = {
  tx: pg.tx,
  getConversationMembers: ConversationService.getConversationMembers,
  getConversationById: ConversationService.getConversationById,
  loadDirectMessageGate: UserRepository.loadDirectMessageGate,
  nextConversationSequence: ConversationCoreRepository.nextConversationSequence,
  updateConversationPointers:
    ConversationCoreRepository.updateConversationPointers,
  applyMessageDeliveryStates:
    ConversationReadStateRepository.applyMessageDeliveryStates,
  backfillMemberJoinSequence:
    ConversationMemberRepository.backfillMemberJoinSequence,
  findPendingUploadForBind: AttachmentRepository.findPendingUploadForBind,
  bindUploadToMessage: AttachmentRepository.bindUploadToMessage,
  insertMessage: MessageRepository.insertMessage,
  findMessageBySenderClientId: MessageRepository.findMessageBySenderClientId,
  findMessageById: MessageRepository.findMessageById,
  insertEvents: OutboxRepository.insertEvents
};

test.afterEach(() => {
  pg.tx = originals.tx;
  ConversationService.getConversationMembers = originals.getConversationMembers;
  ConversationService.getConversationById = originals.getConversationById;
  UserRepository.loadDirectMessageGate = originals.loadDirectMessageGate;
  ConversationCoreRepository.nextConversationSequence =
    originals.nextConversationSequence;
  ConversationCoreRepository.updateConversationPointers =
    originals.updateConversationPointers;
  ConversationReadStateRepository.applyMessageDeliveryStates =
    originals.applyMessageDeliveryStates;
  ConversationMemberRepository.backfillMemberJoinSequence =
    originals.backfillMemberJoinSequence;
  AttachmentRepository.findPendingUploadForBind =
    originals.findPendingUploadForBind;
  AttachmentRepository.bindUploadToMessage = originals.bindUploadToMessage;
  MessageRepository.insertMessage = originals.insertMessage;
  MessageRepository.findMessageBySenderClientId =
    originals.findMessageBySenderClientId;
  MessageRepository.findMessageById = originals.findMessageById;
  OutboxRepository.insertEvents = originals.insertEvents;
});

test.after(async () => {
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
    if (wsServer.wss?.clients) {
      for (const client of wsServer.wss.clients) {
        client.close();
      }
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
});

test("saveMessage stores outbox events for peer and sender secondary devices", async () => {
  const capturedOutboxEvents = [];

  pg.tx = async callback => callback({});
  ConversationService.getConversationMembers = async () => [
    {
      conversation_id: "conv-1",
      user_id: 1001,
      nickname: "Alice",
      role: 0,
      mute_until: null
    },
    {
      conversation_id: "conv-1",
      user_id: 1002,
      nickname: "Bob",
      role: 0,
      mute_until: null
    }
  ];
  ConversationService.getConversationById = async () => ({
    id: "conv-1",
    type: 1,
    settings: null
  });
  UserRepository.loadDirectMessageGate = async () => ({
    sender_blocked_recipient: false,
    recipient_blocked_sender: false,
    recipient_message_permission: 0,
    recipient_saved_sender: true
  });
  ConversationCoreRepository.nextConversationSequence = async () => 12;
  ConversationCoreRepository.updateConversationPointers = async () => {};
  ConversationReadStateRepository.applyMessageDeliveryStates = async () => {};
  ConversationMemberRepository.backfillMemberJoinSequence = async () => {};
  AttachmentRepository.findPendingUploadForBind = async () => null;
  AttachmentRepository.bindUploadToMessage = async () => null;
  MessageRepository.findMessageBySenderClientId = async () => null;
  MessageRepository.findMessageById = async () => null;
  MessageRepository.insertMessage = async (_tx, params) => ({
    id: "msg-1",
    client_message_id: params.client_message_id,
    reply_to_message_id: null,
    conversation_id: params.conversation_id,
    sender_id: params.sender_id,
    type: params.type,
    content: params.content,
    created_at: new Date("2026-03-29T12:00:00.000Z"),
    updated_at: new Date("2026-03-29T12:00:00.000Z"),
    sequence: params.sequence,
    is_recalled: false,
    inserted: true
  });
  OutboxRepository.insertEvents = async (_tx, events) => {
    capturedOutboxEvents.push(...events);
  };

  const result = await MessageService.saveMessage({
    client_message_id: "client-msg-1",
    client_conversation_id: "client-conv-1",
    server_conversation_id: "conv-1",
    sender_id: 1001,
    source_device_id: "device-a1",
    type: 1,
    content: {
      type: 1,
      text: "hello realtime"
    }
  });

  assert.equal(result.message.sequence, 12);
  assert.deepEqual(result.memberUserIds, [1001, 1002]);
  assert.deepEqual(result.deliveryTargets, []);
  assert.equal(result.deliveryPayload, null);

  const deliveryPayload = capturedOutboxEvents[0].payload;
  assert.equal(deliveryPayload.client_message_id, "client-msg-1");
  assert.equal(deliveryPayload.server_conversation_id, "conv-1");
  assert.equal(deliveryPayload.sequence, 12);

  assert.deepEqual(capturedOutboxEvents, [
    {
      event_type: "chat.message.deliver",
      message_id: "msg-1",
      conversation_id: "conv-1",
      target_user_id: 1001,
      target_device_id: "device-a1",
      payload: deliveryPayload
    },
    {
      event_type: "chat.message.deliver",
      message_id: "msg-1",
      conversation_id: "conv-1",
      target_user_id: 1002,
      target_device_id: null,
      payload: deliveryPayload
    },
    {
      event_type: "push.notification",
      message_id: "msg-1",
      conversation_id: "conv-1",
      target_user_id: 1002,
      payload: {
        type: "chat.message",
        title: "Alice",
        body: "hello realtime",
        conversation_id: "conv-1",
        conversation_name: undefined,
        conversation_type: 1,
        message_id: "msg-1",
        is_mention: false,
        sender_user_id: 1001,
        sender_device_id: "device-a1"
      }
    }
  ]);
});

test("saveMessage rejects when sender has blocked the direct-chat peer", async () => {
  pg.tx = async callback => callback({});
  ConversationService.getConversationMembers = async () => [
    {
      conversation_id: "conv-blocked-by-sender",
      user_id: 1001,
      nickname: "Alice",
      role: 0,
      mute_until: null
    },
    {
      conversation_id: "conv-blocked-by-sender",
      user_id: 1002,
      nickname: "Bob",
      role: 0,
      mute_until: null
    }
  ];
  ConversationService.getConversationById = async () => ({
    id: "conv-blocked-by-sender",
    type: 1,
    settings: null
  });
  MessageRepository.findMessageBySenderClientId = async () => null;
  UserRepository.loadDirectMessageGate = async (senderId, recipientId) => ({
    sender_blocked_recipient: senderId === 1001 && recipientId === 1002,
    recipient_blocked_sender: false,
    recipient_message_permission: 0,
    recipient_saved_sender: true
  });

  await assert.rejects(
    () =>
      MessageService.saveMessage({
        client_message_id: "client-msg-blocked-by-sender",
        client_conversation_id: "client-conv-blocked-by-sender",
        server_conversation_id: "conv-blocked-by-sender",
        sender_id: 1001,
        type: 1,
        content: {
          type: 1,
          text: "hello blocked peer"
        }
      }),
    /你已拉黑对方，无法发送消息/
  );
});

test("saveMessage rejects when recipient has blocked the sender", async () => {
  pg.tx = async callback => callback({});
  ConversationService.getConversationMembers = async () => [
    {
      conversation_id: "conv-blocked-by-recipient",
      user_id: 1001,
      nickname: "Alice",
      role: 0,
      mute_until: null
    },
    {
      conversation_id: "conv-blocked-by-recipient",
      user_id: 1002,
      nickname: "Bob",
      role: 0,
      mute_until: null
    }
  ];
  ConversationService.getConversationById = async () => ({
    id: "conv-blocked-by-recipient",
    type: 1,
    settings: null
  });
  MessageRepository.findMessageBySenderClientId = async () => null;
  UserRepository.loadDirectMessageGate = async (senderId, recipientId) => ({
    sender_blocked_recipient: false,
    recipient_blocked_sender: senderId === 1001 && recipientId === 1002,
    recipient_message_permission: 0,
    recipient_saved_sender: true
  });

  await assert.rejects(
    () =>
      MessageService.saveMessage({
        client_message_id: "client-msg-blocked-by-recipient",
        client_conversation_id: "client-conv-blocked-by-recipient",
        server_conversation_id: "conv-blocked-by-recipient",
        sender_id: 1001,
        type: 1,
        content: {
          type: 1,
          text: "hello blocked self"
        }
      }),
    /对方已经将你拉黑，无法发送消息/
  );
});
