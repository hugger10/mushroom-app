import type {
  CallAcceptedMessage,
  CallBusyMessage,
  CallEndReason,
  CallEndedMessage,
  CallInvitedMessage,
  CallMediaStateMessage,
  CallMediaType,
  CallParticipant,
  CallParticipantRole,
  CallParticipantStatus,
  CallRejectedMessage,
  CallScope,
  CallSession,
  CallStateSyncMessage,
  CallStatus,
  CallTimeoutMessage
} from "@mushroom/shared";
import { CALL_END_REASON_REJECTED } from "@mushroom/shared";
import type {
  CallAcceptRequestMessage,
  CallEndRequestMessage,
  CallInviteRequestMessage,
  CallRejectRequestMessage
} from "@mushroom/shared";
import type {
  CallParticipantRecord,
  CallSessionRecord
} from "../repository/models";
import type { CallStateResult } from "../service/call_service";

export type CallBroadcastMessage =
  | CallInvitedMessage
  | CallAcceptedMessage
  | CallBusyMessage
  | CallRejectedMessage
  | CallTimeoutMessage
  | CallEndedMessage
  | CallStateSyncMessage
  | CallMediaStateMessage;

export function mapCallSession(record: CallSessionRecord): CallSession {
  return {
    call_id: record.call_id,
    conversation_id: record.conversation_id,
    call_scope: record.call_scope as CallScope,
    media_type: record.media_type as CallMediaType,
    initiator_user_id: record.initiator_user_id,
    status: record.status as CallStatus,
    active_device_count: record.active_device_count,
    participant_count: record.participant_count,
    started_at: record.started_at.toISOString(),
    answered_at: record.answered_at ? record.answered_at.toISOString() : null,
    ended_at: record.ended_at ? record.ended_at.toISOString() : null,
    end_reason: (record.end_reason as CallEndReason | null | undefined) ?? null,
    created_at: record.created_at.toISOString(),
    updated_at: record.updated_at.toISOString()
  };
}

export function mapCallParticipant(
  record: CallParticipantRecord
): CallParticipant {
  return {
    call_id: record.call_id,
    conversation_id: record.conversation_id,
    user_id: record.user_id,
    device_id: record.device_id,
    participant_role: record.participant_role as CallParticipantRole,
    participant_status: record.participant_status as CallParticipantStatus,
    ringing_at: record.ringing_at ? record.ringing_at.toISOString() : null,
    answered_at: record.answered_at ? record.answered_at.toISOString() : null,
    joined_at: record.joined_at ? record.joined_at.toISOString() : null,
    left_at: record.left_at ? record.left_at.toISOString() : null,
    end_reason: (record.end_reason as CallEndReason | null | undefined) ?? null,
    created_at: record.created_at.toISOString(),
    updated_at: record.updated_at.toISOString()
  };
}

export function findParticipantForDevice(
  callState: CallStateResult,
  userId: number,
  deviceId: string
) {
  return callState.participants.find(
    item =>
      Number(item.user_id) === Number(userId) &&
      String(item.device_id) === String(deviceId)
  );
}

export function buildCallInvitedMessage(
  data: CallInviteRequestMessage,
  callState: CallStateResult,
  directCallTimeoutMs: number
): CallInvitedMessage {
  return {
    messageClassify: "call.invited",
    call_id: data.call_id,
    conversation_id: data.conversation_id,
    call_scope: data.call_scope,
    media_type: callState.session.media_type as CallMediaType,
    sender_user_id: data.sender_user_id,
    sender_device_id: data.sender_device_id,
    request_id: data.request_id,
    timestamp: new Date().toISOString(),
    session: mapCallSession(callState.session),
    participants: callState.participants.map(item => mapCallParticipant(item)),
    timeout_seconds: Math.round(directCallTimeoutMs / 1000)
  };
}

export function buildCallAcceptedMessage(
  data: CallAcceptRequestMessage,
  callState: CallStateResult,
  participant?: CallParticipantRecord
): CallAcceptedMessage {
  return {
    messageClassify: "call.accepted",
    call_id: data.call_id,
    conversation_id: data.conversation_id,
    call_scope: data.call_scope,
    media_type: callState.session.media_type as CallMediaType,
    sender_user_id: data.sender_user_id,
    sender_device_id: data.sender_device_id,
    request_id: data.request_id,
    timestamp: new Date().toISOString(),
    session: mapCallSession(callState.session),
    participant: mapCallParticipant(participant ?? callState.participants[0])
  };
}

export function buildCallRejectedMessage(
  data: CallRejectRequestMessage,
  callState: CallStateResult,
  participant?: CallParticipantRecord
): CallRejectedMessage {
  return {
    messageClassify: "call.rejected",
    call_id: data.call_id,
    conversation_id: data.conversation_id,
    call_scope: data.call_scope,
    media_type: callState.session.media_type as CallMediaType,
    sender_user_id: data.sender_user_id,
    sender_device_id: data.sender_device_id,
    request_id: data.request_id,
    timestamp: new Date().toISOString(),
    session: mapCallSession(callState.session),
    participant: mapCallParticipant(participant ?? callState.participants[0]),
    reason: data.reason ?? CALL_END_REASON_REJECTED
  };
}

export function buildCallBusyMessage(
  data: CallInviteRequestMessage,
  callState: CallStateResult,
  participant?: CallParticipantRecord
): CallBusyMessage {
  return {
    messageClassify: "call.busy",
    call_id: data.call_id,
    conversation_id: data.conversation_id,
    call_scope: data.call_scope,
    media_type: callState.session.media_type as CallMediaType,
    sender_user_id: data.sender_user_id,
    sender_device_id: data.sender_device_id,
    request_id: data.request_id,
    timestamp: new Date().toISOString(),
    session: mapCallSession(callState.session),
    participant: participant ? mapCallParticipant(participant) : undefined
  };
}

export function buildCallTimeoutMessage(
  data: CallInviteRequestMessage,
  callState: CallStateResult,
  participant?: CallParticipantRecord
): CallTimeoutMessage {
  return {
    messageClassify: "call.timeout",
    call_id: data.call_id,
    conversation_id: data.conversation_id,
    call_scope: data.call_scope,
    media_type: callState.session.media_type as CallMediaType,
    sender_user_id: data.sender_user_id,
    sender_device_id: data.sender_device_id,
    request_id: data.request_id,
    timestamp: new Date().toISOString(),
    session: mapCallSession(callState.session),
    participant: participant ? mapCallParticipant(participant) : undefined
  };
}

export function buildCallEndedMessage(
  data: CallEndRequestMessage,
  callState: CallStateResult
): CallEndedMessage {
  return {
    messageClassify: "call.ended",
    call_id: data.call_id,
    conversation_id: data.conversation_id,
    call_scope: data.call_scope,
    media_type: callState.session.media_type as CallMediaType,
    sender_user_id: data.sender_user_id,
    sender_device_id: data.sender_device_id,
    request_id: data.request_id,
    timestamp: new Date().toISOString(),
    session: mapCallSession(callState.session),
    reason:
      (callState.session.end_reason as CallEndReason | null | undefined) ??
      data.reason
  };
}

export function buildCallStateSyncMessage(
  data:
    | CallInviteRequestMessage
    | CallAcceptRequestMessage
    | CallRejectRequestMessage
    | CallEndRequestMessage,
  callState: CallStateResult
): CallStateSyncMessage {
  return {
    messageClassify: "call.state-sync",
    call_id: data.call_id,
    conversation_id: data.conversation_id,
    call_scope: data.call_scope,
    media_type: callState.session.media_type as CallMediaType,
    sender_user_id: data.sender_user_id,
    sender_device_id: data.sender_device_id,
    request_id: data.request_id,
    timestamp: new Date().toISOString(),
    session: mapCallSession(callState.session),
    participants: callState.participants.map(item => mapCallParticipant(item))
  };
}
