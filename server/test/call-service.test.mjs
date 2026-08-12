import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const callServiceModule = require("../dist/server/src/service/call_service.js");
const conversationServiceModule = require("../dist/server/src/service/conversation/conversation_query_service.js");
const callRepositoryModule = require("../dist/server/src/repository/call_repository.js");
const conversationCoreRepositoryModule = require("../dist/server/src/repository/conversation/conversation_core_repository.js");
const conversationMemberRepositoryModule = require("../dist/server/src/repository/conversation/conversation_member_repository.js");
const conversationReadStateRepositoryModule = require("../dist/server/src/repository/conversation/conversation_read_state_repository.js");
const messageRepositoryModule = require("../dist/server/src/repository/message_repository.js");
const outboxRepositoryModule = require("../dist/server/src/repository/outbox_repository.js");
const blockServiceModule = require("../dist/server/src/service/block_service.js");
const configModule = require("../dist/server/src/utils/config.js");
const pgModule = require("../dist/server/src/db/pg.js");
const wsModule = require("../dist/server/src/websocket/index.js");
const redisModule = require("../dist/server/src/cache/redis.js");

const CallService = callServiceModule.default;
const ConversationService = conversationServiceModule.default;
const CallRepository = callRepositoryModule.default;
const ConversationCoreRepository = conversationCoreRepositoryModule.default;
const ConversationMemberRepository = conversationMemberRepositoryModule.default;
const ConversationReadStateRepository =
  conversationReadStateRepositoryModule.default;
const MessageRepository = messageRepositoryModule.default;
const OutboxRepository = outboxRepositoryModule.default;
const BlockService = blockServiceModule.default;
const { config } = configModule;
const pg = pgModule.default;
const { wsServer } = wsModule;
const redis = redisModule.getRedis();

const originals = {
  tx: pg.tx,
  findStaleRingingJoinedCallIdsByUser:
    CallRepository.findStaleRingingJoinedCallIdsByUser,
  findStaleActiveCallIdsByDevice: CallRepository.findStaleActiveCallIdsByDevice,
  findCallSessionByCallId: CallRepository.findCallSessionByCallId,
  findCallParticipantsByCallId: CallRepository.findCallParticipantsByCallId,
  updateParticipantStateForDevice:
    CallRepository.updateParticipantStateForDevice,
  updateSiblingDevicesForUser: CallRepository.updateSiblingDevicesForUser,
  updateRemainingParticipantsForCall:
    CallRepository.updateRemainingParticipantsForCall,
  countParticipantsByStatus: CallRepository.countParticipantsByStatus,
  updateCallSessionState: CallRepository.updateCallSessionState,
  insertCallEvent: CallRepository.insertCallEvent,
  getConversationById: ConversationService.getConversationById,
  getConversationMembers: ConversationService.getConversationMembers,
  findById: ConversationCoreRepository.findById,
  findMembersByConversation:
    ConversationMemberRepository.findMembersByConversation,
  hasBlocked: BlockService.hasBlocked,
  nextConversationSequence: ConversationCoreRepository.nextConversationSequence,
  updateConversationPointers:
    ConversationCoreRepository.updateConversationPointers,
  applyMessageDeliveryStates:
    ConversationReadStateRepository.applyMessageDeliveryStates,
  backfillMemberJoinSequence:
    ConversationMemberRepository.backfillMemberJoinSequence,
  insertMessage: MessageRepository.insertMessage,
  insertEvents: OutboxRepository.insertEvents,
  groupMaxParticipants: config.call.groupMaxParticipants
};

test.afterEach(() => {
  pg.tx = originals.tx;
  CallRepository.findStaleRingingJoinedCallIdsByUser =
    originals.findStaleRingingJoinedCallIdsByUser;
  CallRepository.findStaleActiveCallIdsByDevice =
    originals.findStaleActiveCallIdsByDevice;
  CallRepository.findCallSessionByCallId = originals.findCallSessionByCallId;
  CallRepository.findCallParticipantsByCallId =
    originals.findCallParticipantsByCallId;
  CallRepository.updateParticipantStateForDevice =
    originals.updateParticipantStateForDevice;
  CallRepository.updateSiblingDevicesForUser =
    originals.updateSiblingDevicesForUser;
  CallRepository.updateRemainingParticipantsForCall =
    originals.updateRemainingParticipantsForCall;
  CallRepository.countParticipantsByStatus =
    originals.countParticipantsByStatus;
  CallRepository.updateCallSessionState = originals.updateCallSessionState;
  CallRepository.insertCallEvent = originals.insertCallEvent;
  ConversationService.getConversationById = originals.getConversationById;
  ConversationService.getConversationMembers = originals.getConversationMembers;
  ConversationCoreRepository.findById = originals.findById;
  ConversationMemberRepository.findMembersByConversation =
    originals.findMembersByConversation;
  BlockService.hasBlocked = originals.hasBlocked;
  ConversationCoreRepository.nextConversationSequence =
    originals.nextConversationSequence;
  ConversationCoreRepository.updateConversationPointers =
    originals.updateConversationPointers;
  ConversationReadStateRepository.applyMessageDeliveryStates =
    originals.applyMessageDeliveryStates;
  ConversationMemberRepository.backfillMemberJoinSequence =
    originals.backfillMemberJoinSequence;
  MessageRepository.insertMessage = originals.insertMessage;
  OutboxRepository.insertEvents = originals.insertEvents;
  config.call.groupMaxParticipants = originals.groupMaxParticipants;
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

test("isUserBusy reconciles stale ringing calls before deciding busy", async () => {
  const timedOutCalls = [];

  CallRepository.findStaleRingingJoinedCallIdsByUser = async () => [
    { call_id: "stale-call-1" },
    { call_id: "stale-call-2" }
  ];
  CallRepository.findActiveJoinedParticipantByUser = async () => null;

  const originalMarkTimeout = CallService.markTimeout;
  CallService.markTimeout = async callId => {
    timedOutCalls.push(callId);
    return {
      session: {
        call_id: callId,
        conversation_id: "conv-1",
        call_scope: 1,
        media_type: 1,
        initiator_user_id: 1001,
        status: 4,
        active_device_count: 0,
        participant_count: 2,
        started_at: new Date(),
        created_at: new Date(),
        updated_at: new Date()
      },
      participants: []
    };
  };

  try {
    const isBusy = await CallService.isUserBusy(1002);
    assert.equal(isBusy, false);
    assert.deepEqual(timedOutCalls, ["stale-call-1", "stale-call-2"]);
  } finally {
    CallService.markTimeout = originalMarkTimeout;
  }
});

test("reconcileDeviceReconnect force closes stale device calls", async () => {
  const reconciledCalls = [];
  const originalForceCloseDeviceCall = CallService.forceCloseDeviceCall;

  CallRepository.findStaleActiveCallIdsByDevice = async () => [
    { call_id: "stale-device-call-1" },
    { call_id: "stale-device-call-2" }
  ];

  CallService.forceCloseDeviceCall = async params => {
    reconciledCalls.push(params);
    return null;
  };

  try {
    await CallService.reconcileDeviceReconnect(1002, "device-b");
    assert.deepEqual(reconciledCalls, [
      {
        call_id: "stale-device-call-1",
        user_id: 1002,
        device_id: "device-b"
      },
      {
        call_id: "stale-device-call-2",
        user_id: 1002,
        device_id: "device-b"
      }
    ]);
  } finally {
    CallService.forceCloseDeviceCall = originalForceCloseDeviceCall;
  }
});

test("acceptCall rejects group calls that exceed configured participant limit", async () => {
  config.call.groupMaxParticipants = 2;

  CallRepository.findCallSessionByCallId = async () => ({
    call_id: "group-call-limit",
    conversation_id: "conv-group-1",
    call_scope: 2,
    media_type: 2,
    initiator_user_id: 1001,
    status: 2,
    active_device_count: 2,
    participant_count: 3,
    started_at: new Date("2026-04-07T08:00:00.000Z"),
    answered_at: null,
    ended_at: null,
    end_reason: null,
    created_at: new Date("2026-04-07T08:00:00.000Z"),
    updated_at: new Date("2026-04-07T08:00:00.000Z")
  });
  CallRepository.findCallParticipantsByCallId = async () => [
    {
      user_id: 1001,
      device_id: "device-a",
      participant_status: 4
    },
    {
      user_id: 1002,
      device_id: "device-b",
      participant_status: 4
    },
    {
      user_id: 1003,
      device_id: "device-c",
      participant_status: 2
    }
  ];

  await assert.rejects(
    () =>
      CallService.acceptCall({
        call_id: "group-call-limit",
        user_id: 1003,
        device_id: "device-c",
        media_type: 1
      }),
    /当前群通话人数已满/
  );
});

test("createCall rejects direct calls when initiator has blocked the peer", async () => {
  ConversationService.getConversationById = async () => ({
    id: "conv-direct-blocked-sender",
    type: 1
  });
  ConversationService.getConversationMembers = async () => [
    {
      conversation_id: "conv-direct-blocked-sender",
      user_id: 1001,
      nickname: "Alice",
      role: 0
    },
    {
      conversation_id: "conv-direct-blocked-sender",
      user_id: 1002,
      nickname: "Bob",
      role: 0
    }
  ];
  BlockService.hasBlocked = async (blockerId, blockedId) =>
    blockerId === 1001 && blockedId === 1002;

  await assert.rejects(
    () =>
      CallService.createCall({
        call_id: "call-direct-blocked-sender",
        conversation_id: "conv-direct-blocked-sender",
        call_scope: 1,
        media_type: 1,
        initiator_user_id: 1001,
        initiator_device_id: "device-a",
        targets: [{ user_id: 1002, device_id: "device-b" }]
      }),
    /你已拉黑对方，无法发起通话/
  );
});

test("createCall rejects direct calls when peer has blocked the initiator", async () => {
  ConversationService.getConversationById = async () => ({
    id: "conv-direct-blocked-recipient",
    type: 1
  });
  ConversationService.getConversationMembers = async () => [
    {
      conversation_id: "conv-direct-blocked-recipient",
      user_id: 1001,
      nickname: "Alice",
      role: 0
    },
    {
      conversation_id: "conv-direct-blocked-recipient",
      user_id: 1002,
      nickname: "Bob",
      role: 0
    }
  ];
  BlockService.hasBlocked = async (blockerId, blockedId) =>
    blockerId === 1002 && blockedId === 1001;

  await assert.rejects(
    () =>
      CallService.createCall({
        call_id: "call-direct-blocked-recipient",
        conversation_id: "conv-direct-blocked-recipient",
        call_scope: 1,
        media_type: 1,
        initiator_user_id: 1001,
        initiator_device_id: "device-a",
        targets: [{ user_id: 1002, device_id: "device-b" }]
      }),
    /对方已经将你拉黑，无法发起通话/
  );
});

test("acceptCall keeps group call media type when a participant joins audio-only", async () => {
  config.call.groupMaxParticipants = 8;

  const currentSession = {
    call_id: "group-call-media",
    conversation_id: "conv-group-2",
    call_scope: 2,
    media_type: 2,
    initiator_user_id: 1001,
    status: 2,
    active_device_count: 1,
    participant_count: 3,
    started_at: new Date("2026-04-07T08:10:00.000Z"),
    answered_at: null,
    ended_at: null,
    end_reason: null,
    created_at: new Date("2026-04-07T08:10:00.000Z"),
    updated_at: new Date("2026-04-07T08:10:00.000Z")
  };
  const nextSession = {
    ...currentSession,
    status: 3,
    active_device_count: 2,
    answered_at: new Date("2026-04-07T08:10:08.000Z"),
    updated_at: new Date("2026-04-07T08:10:08.000Z")
  };
  const nextParticipants = [
    {
      call_id: "group-call-media",
      conversation_id: "conv-group-2",
      user_id: 1001,
      device_id: "device-a",
      participant_role: 1,
      participant_status: 4
    },
    {
      call_id: "group-call-media",
      conversation_id: "conv-group-2",
      user_id: 1002,
      device_id: "device-b",
      participant_role: 2,
      participant_status: 4
    }
  ];

  let updateCallSessionStateArgs = null;

  CallRepository.findCallSessionByCallId = async () => currentSession;
  CallRepository.findCallParticipantsByCallId = async () => [
    {
      call_id: "group-call-media",
      conversation_id: "conv-group-2",
      user_id: 1001,
      device_id: "device-a",
      participant_role: 1,
      participant_status: 4
    },
    {
      call_id: "group-call-media",
      conversation_id: "conv-group-2",
      user_id: 1002,
      device_id: "device-b",
      participant_role: 2,
      participant_status: 2
    }
  ];
  CallRepository.updateParticipantStateForDevice = async () => ({
    call_id: "group-call-media",
    conversation_id: "conv-group-2",
    user_id: 1002,
    device_id: "device-b",
    participant_role: 2,
    participant_status: 4
  });
  CallRepository.updateSiblingDevicesForUser = async () => [];
  CallRepository.countParticipantsByStatus = async () => 2;
  CallRepository.updateCallSessionState = async (_tx, params) => {
    updateCallSessionStateArgs = params;
    return nextSession;
  };
  CallRepository.insertCallEvent = async () => ({});

  pg.tx = async callback =>
    callback({
      one: async () => nextSession,
      manyOrNone: async () => nextParticipants
    });

  const result = await CallService.acceptCall({
    call_id: "group-call-media",
    user_id: 1002,
    device_id: "device-b",
    media_type: 1
  });

  assert.equal(updateCallSessionStateArgs.media_type, 2);
  assert.equal(result.session.media_type, 2);
  assert.equal(result.session.status, 3);
});

test("endCall closes a group call once only one joined participant remains", async () => {
  const startedAt = new Date("2026-04-07T09:00:00.000Z");
  const endedAt = new Date("2026-04-07T09:05:00.000Z");
  const currentSession = {
    call_id: "group-call-end-1",
    conversation_id: "conv-group-end-1",
    call_scope: 2,
    media_type: 2,
    initiator_user_id: 1001,
    status: 3,
    active_device_count: 2,
    participant_count: 3,
    started_at: startedAt,
    answered_at: startedAt,
    ended_at: null,
    end_reason: null,
    created_at: startedAt,
    updated_at: startedAt
  };
  const endedSession = {
    ...currentSession,
    status: 4,
    active_device_count: 1,
    ended_at: endedAt,
    end_reason: 1,
    updated_at: endedAt
  };
  const participants = [
    {
      call_id: "group-call-end-1",
      conversation_id: "conv-group-end-1",
      user_id: 1001,
      device_id: "device-a",
      participant_role: 1,
      participant_status: 8,
      joined_at: startedAt,
      left_at: endedAt,
      end_reason: 2,
      created_at: startedAt,
      updated_at: endedAt
    },
    {
      call_id: "group-call-end-1",
      conversation_id: "conv-group-end-1",
      user_id: 1002,
      device_id: "device-b",
      participant_role: 2,
      participant_status: 4,
      joined_at: startedAt,
      created_at: startedAt,
      updated_at: endedAt
    }
  ];

  let updatedSessionState = null;
  let insertedEvent = null;
  let persistedOutcome = null;

  CallRepository.findCallSessionByCallId = async () => currentSession;
  CallRepository.findCallParticipantsByCallId = async () => participants;
  CallRepository.updateParticipantStateForDevice = async () => ({
    call_id: "group-call-end-1",
    conversation_id: "conv-group-end-1",
    user_id: 1001,
    device_id: "device-a",
    participant_status: 8
  });
  CallRepository.countParticipantsByStatus = async () => 1;
  CallRepository.updateCallSessionState = async (_tx, params) => {
    updatedSessionState = params;
    return endedSession;
  };
  CallRepository.insertCallEvent = async (_tx, event) => {
    insertedEvent = event;
    return event;
  };

  const originalPersistCallRecordMessage = CallService.persistCallRecordMessage;
  CallService.persistCallRecordMessage = async (_tx, nextState, outcome) => {
    persistedOutcome = {
      outcome,
      status: nextState.session.status,
      active_device_count: nextState.session.active_device_count
    };
  };

  pg.tx = async callback =>
    callback({
      one: async () => endedSession,
      manyOrNone: async () => participants
    });

  try {
    const result = await CallService.endCall({
      call_id: "group-call-end-1",
      user_id: 1001,
      device_id: "device-a",
      request_id: "req-group-end-1"
    });

    assert.equal(updatedSessionState?.status, 4);
    assert.equal(updatedSessionState?.active_device_count, 1);
    assert.equal(updatedSessionState?.end_reason, 1);
    assert.equal(result.session.status, 4);
    assert.equal(result.session.active_device_count, 1);
    assert.equal(insertedEvent?.event_type, "call.end.request");
    assert.deepEqual(persistedOutcome, {
      outcome: "completed",
      status: 4,
      active_device_count: 1
    });
  } finally {
    CallService.persistCallRecordMessage = originalPersistCallRecordMessage;
  }
});

test("finalizeBusyInviteCall ends a direct busy invite and writes a busy call record", async () => {
  const startedAt = new Date("2026-04-02T09:00:00.000Z");
  const endedAt = new Date("2026-04-02T09:00:10.000Z");
  const currentSession = {
    call_id: "call-busy-1",
    conversation_id: "conv-1",
    call_scope: 1,
    media_type: 1,
    initiator_user_id: 1001,
    status: 2,
    active_device_count: 1,
    participant_count: 2,
    started_at: startedAt,
    answered_at: null,
    ended_at: null,
    end_reason: null,
    created_at: startedAt,
    updated_at: startedAt
  };
  const endedSession = {
    ...currentSession,
    status: 4,
    active_device_count: 0,
    ended_at: endedAt,
    end_reason: 4,
    updated_at: endedAt
  };
  const participants = [
    {
      call_id: "call-busy-1",
      conversation_id: "conv-1",
      user_id: 1001,
      device_id: "device-a",
      participant_role: 1,
      participant_status: 8,
      ringing_at: null,
      answered_at: startedAt,
      joined_at: startedAt,
      left_at: endedAt,
      end_reason: 4,
      created_at: startedAt,
      updated_at: endedAt
    },
    {
      call_id: "call-busy-1",
      conversation_id: "conv-1",
      user_id: 1002,
      device_id: "device-b",
      participant_role: 2,
      participant_status: 6,
      ringing_at: startedAt,
      answered_at: null,
      joined_at: null,
      left_at: endedAt,
      end_reason: 4,
      created_at: startedAt,
      updated_at: endedAt
    }
  ];

  let insertedEvent = null;
  let insertedMessage = null;

  CallRepository.findCallSessionByCallId = async () => currentSession;
  CallRepository.findCallParticipantsByCallId = async () => participants;
  CallRepository.updateRemainingParticipantsForCall = async () => [];
  CallRepository.updateCallSessionState = async () => endedSession;
  CallRepository.insertCallEvent = async (_tx, event) => {
    insertedEvent = event;
    return { id: 1, ...event };
  };

  ConversationCoreRepository.findById = async () => ({
    id: "conv-1",
    type: 1,
    peer_id: 1002,
    settings: null
  });
  ConversationMemberRepository.findMembersByConversation = async () => [
    { user_id: 1001 },
    { user_id: 1002 }
  ];
  ConversationCoreRepository.nextConversationSequence = async () => 21;
  ConversationCoreRepository.updateConversationPointers = async () => {};
  ConversationReadStateRepository.applyMessageDeliveryStates = async () => {};
  ConversationMemberRepository.backfillMemberJoinSequence = async () => {};

  MessageRepository.insertMessage = async (_tx, params) => {
    insertedMessage = params;
    return {
      id: "msg-call-busy-1",
      client_message_id: params.client_message_id ?? "",
      conversation_id: params.conversation_id,
      sender_id: params.sender_id,
      type: params.type,
      content: params.content,
      created_at: endedAt,
      updated_at: endedAt,
      sequence: params.sequence
    };
  };
  OutboxRepository.insertEvents = async () => {};

  pg.tx = async callback =>
    callback({
      one: async (query, params) => {
        if (
          typeof query === "string" &&
          query.includes("FROM call_sessions") &&
          query.includes("WHERE call_id = $1")
        ) {
          assert.deepEqual(params, ["call-busy-1"]);
          return endedSession;
        }
        throw new Error(`Unexpected tx.one query: ${String(query)}`);
      },
      manyOrNone: async (query, params) => {
        if (
          typeof query === "string" &&
          query.includes("FROM call_participants")
        ) {
          assert.deepEqual(params, ["call-busy-1"]);
          return participants;
        }
        throw new Error(`Unexpected tx.manyOrNone query: ${String(query)}`);
      }
    });

  const result = await CallService.finalizeBusyInviteCall({
    call_id: "call-busy-1",
    request_id: "req-busy-1",
    payload: { call_id: "call-busy-1" }
  });

  assert.equal(result.session.status, 4);
  assert.equal(result.session.end_reason, 4);
  assert.equal(insertedEvent?.event_type, "call.busy");
  assert.equal(insertedMessage?.content?.outcome, "busy");
  assert.equal(insertedMessage?.content?.media_type, "audio");
  assert.equal(insertedMessage?.content?.text, "语音通话对方忙线中");
});
