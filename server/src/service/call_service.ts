import pg from "../db/pg";
import { BusinessError } from "../handler/business_error";
import ConversationService from "./conversation/conversation_query_service";
import ConversationCoreRepository from "../repository/conversation/conversation_core_repository";
import ConversationMemberRepository from "../repository/conversation/conversation_member_repository";
import ConversationReadStateRepository from "../repository/conversation/conversation_read_state_repository";
import type { DbTx } from "../repository/conversation/conversation_core_repository";
import CallRepository from "../repository/call_repository";
import MessageRepository from "../repository/message_repository";
import OutboxRepository from "../repository/outbox_repository";
import type {
  CallParticipantRecord,
  CallSessionRecord,
  MessageRecord
} from "../repository/models";
import {
  CALL_MEDIA_TYPE_AUDIO,
  CALL_SCOPE_DIRECT,
  CALL_END_REASON_COMPLETED,
  CALL_END_REASON_BUSY,
  CALL_END_REASON_CANCELLED_BY_INITIATOR,
  CALL_END_REASON_FORCE_CLOSED,
  CALL_END_REASON_REJECTED,
  CALL_END_REASON_TIMEOUT,
  CALL_PARTICIPANT_ROLE_INITIATOR,
  CALL_PARTICIPANT_ROLE_INVITEE,
  CALL_PARTICIPANT_STATUS_BUSY,
  CALL_PARTICIPANT_STATUS_DECLINED,
  CALL_PARTICIPANT_STATUS_INVITED,
  CALL_PARTICIPANT_STATUS_JOINED,
  CALL_PARTICIPANT_STATUS_LEFT,
  CALL_PARTICIPANT_STATUS_RINGING,
  CALL_PARTICIPANT_STATUS_SUPERSEDED_BY_SIBLING_DEVICE,
  CALL_PARTICIPANT_STATUS_TIMEOUT,
  CALL_STATUS_CANCELLED,
  CALL_STATUS_ENDED,
  CALL_STATUS_INITIATED,
  CALL_STATUS_ONGOING,
  CALL_STATUS_RINGING
} from "@mushroom/shared";
import { generateId } from "../utils/id_generator";
import { mapMessages } from "../utils/mapper";
import { config } from "../utils/config";
import BlockService from "./block_service";

export interface CallDeviceTarget {
  user_id: number;
  device_id: string;
  participant_status?: number;
  end_reason?: number | null;
}

export interface CreateCallInput {
  call_id: string;
  conversation_id: string;
  call_scope: number;
  media_type: number;
  initiator_user_id: number;
  initiator_device_id: string;
  targets: CallDeviceTarget[];
  request_id?: string;
  payload?: Record<string, unknown>;
}

export interface CallStateResult {
  session: CallSessionRecord;
  participants: CallParticipantRecord[];
}

class CallService {
  private readonly staleDirectCallTimeoutMs =
    config.call.inviteTimeoutSeconds * 1000;

  async getCallById(callId: string): Promise<CallStateResult | null> {
    const session = await CallRepository.findCallSessionByCallId(callId);
    if (!session) {
      return null;
    }

    const participants =
      await CallRepository.findCallParticipantsByCallId(callId);
    return { session, participants };
  }

  async getCallStateForUser(
    callId: string,
    userId: number
  ): Promise<CallStateResult> {
    const state = await this.getCallStateOrThrow(callId);
    if (
      !state.participants.some(
        participant => Number(participant.user_id) === Number(userId)
      )
    ) {
      throw new BusinessError("Call participant not found", 404);
    }

    return state;
  }

  async createCall(input: CreateCallInput): Promise<CallStateResult> {
    const conversation = await ConversationService.getConversationById(
      input.conversation_id
    );
    if (!conversation) {
      throw new BusinessError("Conversation not found");
    }

    const members = await ConversationService.getConversationMembers(
      input.conversation_id
    );
    if (
      !members.some(
        member => Number(member.user_id) === input.initiator_user_id
      )
    ) {
      throw new BusinessError("Initiator is not a member of this conversation");
    }

    const validMemberIds = new Set(
      members.map(member => Number(member.user_id))
    );
    for (const target of input.targets) {
      if (!validMemberIds.has(target.user_id)) {
        throw new BusinessError(
          "Call target is not a member of this conversation"
        );
      }
    }

    if (input.call_scope === CALL_SCOPE_DIRECT) {
      const peerUserId =
        members.find(
          member => Number(member.user_id) !== Number(input.initiator_user_id)
        )?.user_id ?? 0;
      if (!peerUserId) {
        throw new BusinessError("Invalid direct conversation members");
      }

      if (await BlockService.hasBlocked(input.initiator_user_id, peerUserId)) {
        throw new BusinessError("你已拉黑对方，无法发起通话");
      }

      if (await BlockService.hasBlocked(peerUserId, input.initiator_user_id)) {
        throw new BusinessError("对方已经将你拉黑，无法发起通话");
      }
    }

    const dedupedTargets = new Map<string, CallDeviceTarget>();
    for (const target of input.targets) {
      if (
        target.user_id === input.initiator_user_id &&
        target.device_id === input.initiator_device_id
      ) {
        continue;
      }
      dedupedTargets.set(`${target.user_id}:${target.device_id}`, target);
    }

    return pg.tx(async (t: DbTx) => {
      await CallRepository.insertCallSession(t, {
        call_id: input.call_id,
        conversation_id: input.conversation_id,
        call_scope: input.call_scope,
        media_type: input.media_type,
        initiator_user_id: input.initiator_user_id,
        status: CALL_STATUS_INITIATED,
        active_device_count: 1,
        participant_count: dedupedTargets.size + 1
      });

      const participants = await CallRepository.insertCallParticipants(t, [
        {
          call_id: input.call_id,
          conversation_id: input.conversation_id,
          user_id: input.initiator_user_id,
          device_id: input.initiator_device_id,
          participant_role: CALL_PARTICIPANT_ROLE_INITIATOR,
          participant_status: CALL_PARTICIPANT_STATUS_JOINED,
          answered_at: new Date(),
          joined_at: new Date()
        },
        ...Array.from(dedupedTargets.values()).map(target => ({
          call_id: input.call_id,
          conversation_id: input.conversation_id,
          user_id: target.user_id,
          device_id: target.device_id,
          participant_role: CALL_PARTICIPANT_ROLE_INVITEE,
          participant_status:
            target.participant_status ?? CALL_PARTICIPANT_STATUS_RINGING,
          ringing_at:
            (target.participant_status ?? CALL_PARTICIPANT_STATUS_RINGING) ===
            CALL_PARTICIPANT_STATUS_RINGING
              ? new Date()
              : null,
          left_at:
            target.participant_status === CALL_PARTICIPANT_STATUS_BUSY
              ? new Date()
              : null,
          end_reason: target.end_reason ?? null
        }))
      ]);

      await CallRepository.updateCallSessionState(t, {
        call_id: input.call_id,
        status: CALL_STATUS_RINGING,
        active_device_count: 1,
        participant_count: participants.length
      });

      await CallRepository.insertCallEvent(t, {
        call_id: input.call_id,
        conversation_id: input.conversation_id,
        event_type: "call.invite.request",
        request_id: input.request_id ?? null,
        sender_user_id: input.initiator_user_id,
        sender_device_id: input.initiator_device_id,
        payload: input.payload ?? {}
      });

      return this.loadCallState(t, input.call_id);
    });
  }

  async acceptCall(params: {
    call_id: string;
    user_id: number;
    device_id: string;
    media_type?: number;
    request_id?: string;
    payload?: Record<string, unknown>;
  }): Promise<CallStateResult> {
    const current = await this.getCallStateOrThrow(params.call_id);
    const isDirectCall = current.session.call_scope === CALL_SCOPE_DIRECT;
    if (
      current.session.status === CALL_STATUS_CANCELLED ||
      current.session.status === CALL_STATUS_ENDED
    ) {
      throw new BusinessError("Call already ended");
    }

    if (
      current.session.status !== CALL_STATUS_RINGING &&
      current.session.status !== CALL_STATUS_ONGOING
    ) {
      throw new BusinessError("Call is not in an acceptable state");
    }

    const joinedParticipant = current.participants.find(
      participant =>
        participant.user_id === params.user_id &&
        participant.participant_status === CALL_PARTICIPANT_STATUS_JOINED
    );
    if (joinedParticipant) {
      throw new BusinessError("Another device already joined this call");
    }

    if (!isDirectCall) {
      const joinedCount = current.participants.filter(
        participant =>
          participant.participant_status === CALL_PARTICIPANT_STATUS_JOINED
      ).length;
      if (joinedCount >= config.call.groupMaxParticipants) {
        throw new BusinessError("当前群通话人数已满");
      }
    }

    return pg.tx(async (t: DbTx) => {
      const now = new Date();
      const participant = await CallRepository.updateParticipantStateForDevice(
        t,
        {
          call_id: params.call_id,
          user_id: params.user_id,
          device_id: params.device_id,
          participant_status: CALL_PARTICIPANT_STATUS_JOINED,
          answered_at: now,
          joined_at: now
        }
      );

      if (!participant) {
        throw new BusinessError("Call participant not found");
      }

      await CallRepository.updateSiblingDevicesForUser(t, {
        call_id: params.call_id,
        user_id: params.user_id,
        exclude_device_id: params.device_id,
        participant_status:
          CALL_PARTICIPANT_STATUS_SUPERSEDED_BY_SIBLING_DEVICE,
        left_at: now,
        end_reason: CALL_END_REASON_FORCE_CLOSED
      });

      const activeDeviceCount = await CallRepository.countParticipantsByStatus(
        t,
        params.call_id,
        [CALL_PARTICIPANT_STATUS_JOINED]
      );

      await CallRepository.updateCallSessionState(t, {
        call_id: params.call_id,
        status: CALL_STATUS_ONGOING,
        media_type: isDirectCall
          ? (params.media_type ?? current.session.media_type)
          : current.session.media_type,
        active_device_count: activeDeviceCount,
        answered_at: current.session.answered_at ?? now
      });

      await CallRepository.insertCallEvent(t, {
        call_id: params.call_id,
        conversation_id: current.session.conversation_id,
        event_type: "call.accept.request",
        request_id: params.request_id ?? null,
        sender_user_id: params.user_id,
        sender_device_id: params.device_id,
        payload: params.payload ?? {}
      });

      return this.loadCallState(t, params.call_id);
    });
  }

  async rejectCall(params: {
    call_id: string;
    user_id: number;
    device_id: string;
    request_id?: string;
    payload?: Record<string, unknown>;
  }): Promise<CallStateResult> {
    const current = await this.getCallStateOrThrow(params.call_id);
    if (
      current.session.status === CALL_STATUS_CANCELLED ||
      current.session.status === CALL_STATUS_ENDED
    ) {
      throw new BusinessError("Call already ended");
    }

    return pg.tx(async (t: DbTx) => {
      const now = new Date();
      const isDirectCall = current.session.call_scope === CALL_SCOPE_DIRECT;
      const participant = await CallRepository.updateParticipantStateForDevice(
        t,
        {
          call_id: params.call_id,
          user_id: params.user_id,
          device_id: params.device_id,
          participant_status: CALL_PARTICIPANT_STATUS_DECLINED,
          left_at: now,
          end_reason: CALL_END_REASON_REJECTED
        }
      );

      if (!participant) {
        throw new BusinessError("Call participant not found");
      }

      if (isDirectCall) {
        await CallRepository.updateRemainingParticipantsForCall(t, {
          call_id: params.call_id,
          exclude_user_id: params.user_id,
          exclude_device_id: params.device_id,
          participant_status: CALL_PARTICIPANT_STATUS_LEFT,
          left_at: now,
          end_reason: CALL_END_REASON_FORCE_CLOSED
        });
      }

      const activeDeviceCount = await CallRepository.countParticipantsByStatus(
        t,
        params.call_id,
        [CALL_PARTICIPANT_STATUS_JOINED]
      );
      const shouldEndCall = isDirectCall ? activeDeviceCount <= 0 : false;

      await CallRepository.updateCallSessionState(t, {
        call_id: params.call_id,
        status: shouldEndCall ? CALL_STATUS_ENDED : current.session.status,
        active_device_count: activeDeviceCount,
        ended_at: shouldEndCall ? now : null,
        end_reason: shouldEndCall ? CALL_END_REASON_REJECTED : null
      });

      await CallRepository.insertCallEvent(t, {
        call_id: params.call_id,
        conversation_id: current.session.conversation_id,
        event_type: "call.reject.request",
        request_id: params.request_id ?? null,
        sender_user_id: params.user_id,
        sender_device_id: params.device_id,
        payload: params.payload ?? {}
      });

      const nextState = await this.loadCallState(t, params.call_id);
      if (shouldEndCall) {
        await this.persistCallRecordMessage(t, nextState, "rejected");
      }

      return nextState;
    });
  }

  async markBusy(params: {
    call_id: string;
    user_id: number;
    device_id: string;
    request_id?: string;
    payload?: Record<string, unknown>;
  }): Promise<CallStateResult> {
    const current = await this.getCallStateOrThrow(params.call_id);

    return pg.tx(async (t: DbTx) => {
      const participant = await CallRepository.updateParticipantStateForDevice(
        t,
        {
          call_id: params.call_id,
          user_id: params.user_id,
          device_id: params.device_id,
          participant_status: CALL_PARTICIPANT_STATUS_BUSY,
          left_at: new Date(),
          end_reason: CALL_END_REASON_BUSY
        }
      );

      if (!participant) {
        throw new BusinessError("Call participant not found");
      }

      await CallRepository.insertCallEvent(t, {
        call_id: params.call_id,
        conversation_id: current.session.conversation_id,
        event_type: "call.busy",
        request_id: params.request_id ?? null,
        sender_user_id: params.user_id,
        sender_device_id: params.device_id,
        payload: params.payload ?? {}
      });

      return this.loadCallState(t, params.call_id);
    });
  }

  async finalizeBusyInviteCall(params: {
    call_id: string;
    request_id?: string;
    payload?: Record<string, unknown>;
  }): Promise<CallStateResult> {
    const current = await this.getCallStateOrThrow(params.call_id);
    if (
      current.session.status === CALL_STATUS_CANCELLED ||
      current.session.status === CALL_STATUS_ENDED
    ) {
      return current;
    }

    const initiatorParticipant = current.participants.find(
      participant =>
        participant.user_id === current.session.initiator_user_id &&
        participant.participant_role === CALL_PARTICIPANT_ROLE_INITIATOR
    );

    return pg.tx(async (t: DbTx) => {
      const now = new Date();

      await CallRepository.updateRemainingParticipantsForCall(t, {
        call_id: params.call_id,
        participant_status: CALL_PARTICIPANT_STATUS_LEFT,
        left_at: now,
        end_reason: CALL_END_REASON_BUSY
      });

      await CallRepository.updateCallSessionState(t, {
        call_id: params.call_id,
        status: CALL_STATUS_ENDED,
        active_device_count: 0,
        ended_at: now,
        end_reason: CALL_END_REASON_BUSY
      });

      await CallRepository.insertCallEvent(t, {
        call_id: params.call_id,
        conversation_id: current.session.conversation_id,
        event_type: "call.busy",
        request_id: params.request_id ?? null,
        sender_user_id: current.session.initiator_user_id,
        sender_device_id: initiatorParticipant?.device_id ?? null,
        payload: params.payload ?? {}
      });

      const nextState = await this.loadCallState(t, params.call_id);
      await this.persistCallRecordMessage(t, nextState, "busy");
      return nextState;
    });
  }

  async markTimeout(callId: string): Promise<CallStateResult> {
    const current = await this.getCallStateOrThrow(callId);

    return pg.tx(async (t: DbTx) => {
      const now = new Date();
      for (const participant of current.participants) {
        if (
          participant.participant_status === CALL_PARTICIPANT_STATUS_RINGING ||
          participant.participant_status === CALL_PARTICIPANT_STATUS_INVITED
        ) {
          await CallRepository.updateParticipantStateForDevice(t, {
            call_id: callId,
            user_id: participant.user_id,
            device_id: participant.device_id,
            participant_status: CALL_PARTICIPANT_STATUS_TIMEOUT,
            left_at: now,
            end_reason: CALL_END_REASON_TIMEOUT
          });
        }
      }

      const joinedCount = await CallRepository.countParticipantsByStatus(
        t,
        callId,
        [CALL_PARTICIPANT_STATUS_JOINED]
      );
      const shouldEndCall = joinedCount <= 1;

      if (shouldEndCall) {
        await CallRepository.updateRemainingParticipantsForCall(t, {
          call_id: callId,
          participant_status: CALL_PARTICIPANT_STATUS_LEFT,
          left_at: now,
          end_reason: CALL_END_REASON_FORCE_CLOSED
        });
      }

      const nextActiveDeviceCount = shouldEndCall ? 0 : joinedCount;

      await CallRepository.updateCallSessionState(t, {
        call_id: callId,
        status: shouldEndCall ? CALL_STATUS_ENDED : CALL_STATUS_ONGOING,
        active_device_count: nextActiveDeviceCount,
        ended_at: shouldEndCall ? now : null,
        end_reason: shouldEndCall ? CALL_END_REASON_TIMEOUT : null
      });

      const nextState = await this.loadCallState(t, callId);
      if (shouldEndCall) {
        await this.persistCallRecordMessage(t, nextState, "timeout");
      }

      await CallRepository.insertCallEvent(t, {
        call_id: callId,
        conversation_id: current.session.conversation_id,
        event_type: "call.timeout",
        payload: {}
      });

      return nextState;
    });
  }

  async endCall(params: {
    call_id: string;
    user_id: number;
    device_id: string;
    request_id?: string;
    payload?: Record<string, unknown>;
  }): Promise<CallStateResult> {
    const current = await this.getCallStateOrThrow(params.call_id);
    const now = new Date();
    const isDirectCall = current.session.call_scope === CALL_SCOPE_DIRECT;

    return pg.tx(async (t: DbTx) => {
      // 如果通话已结束（状态为 ENDED），只将当前参与者标记为 LEFT，
      // 不再重复生成 call_record 或改变会话状态。
      if (current.session.status === CALL_STATUS_ENDED) {
        await CallRepository.updateParticipantStateForDevice(t, {
          call_id: params.call_id,
          user_id: params.user_id,
          device_id: params.device_id,
          participant_status: CALL_PARTICIPANT_STATUS_LEFT,
          left_at: now,
          end_reason: CALL_END_REASON_FORCE_CLOSED
        });
        return this.loadCallState(t, params.call_id);
      }

      const participant = await CallRepository.updateParticipantStateForDevice(
        t,
        {
          call_id: params.call_id,
          user_id: params.user_id,
          device_id: params.device_id,
          participant_status: CALL_PARTICIPANT_STATUS_LEFT,
          left_at: now,
          end_reason:
            params.user_id === current.session.initiator_user_id
              ? CALL_END_REASON_CANCELLED_BY_INITIATOR
              : CALL_END_REASON_FORCE_CLOSED
        }
      );

      if (!participant) {
        throw new BusinessError("Call participant not found");
      }

      if (isDirectCall) {
        await CallRepository.updateRemainingParticipantsForCall(t, {
          call_id: params.call_id,
          exclude_user_id: params.user_id,
          exclude_device_id: params.device_id,
          participant_status: CALL_PARTICIPANT_STATUS_LEFT,
          left_at: now,
          end_reason: CALL_END_REASON_FORCE_CLOSED
        });
      }

      const activeDeviceCount = await CallRepository.countParticipantsByStatus(
        t,
        params.call_id,
        [CALL_PARTICIPANT_STATUS_JOINED]
      );

      const shouldEndCall = isDirectCall
        ? activeDeviceCount <= 0
        : activeDeviceCount <= 1;
      const isCancelledByInitiatorBeforeAnswer =
        params.user_id === current.session.initiator_user_id &&
        current.session.status === CALL_STATUS_RINGING;
      const sessionEndReason = isCancelledByInitiatorBeforeAnswer
        ? CALL_END_REASON_CANCELLED_BY_INITIATOR
        : CALL_END_REASON_COMPLETED;
      const recordOutcome = isCancelledByInitiatorBeforeAnswer
        ? "cancelled"
        : "completed";

      await CallRepository.updateCallSessionState(t, {
        call_id: params.call_id,
        status: shouldEndCall ? CALL_STATUS_ENDED : current.session.status,
        active_device_count: activeDeviceCount,
        ended_at: shouldEndCall ? now : null,
        end_reason: shouldEndCall ? sessionEndReason : null
      });

      const nextState = await this.loadCallState(t, params.call_id);
      if (shouldEndCall) {
        await this.persistCallRecordMessage(t, nextState, recordOutcome);
      }

      await CallRepository.insertCallEvent(t, {
        call_id: params.call_id,
        conversation_id: current.session.conversation_id,
        event_type: "call.end.request",
        request_id: params.request_id ?? null,
        sender_user_id: params.user_id,
        sender_device_id: params.device_id,
        payload: params.payload ?? {}
      });

      return nextState;
    });
  }

  async isUserBusy(userId: number): Promise<boolean> {
    await this.reconcileStaleRingingCallsForUser(userId);
    const participant =
      await CallRepository.findActiveJoinedParticipantByUser(userId);
    return Boolean(participant);
  }

  async reconcileStaleRingingCallsForUser(userId: number) {
    const staleBefore = new Date(Date.now() - this.staleDirectCallTimeoutMs);
    const staleCalls = await CallRepository.findStaleRingingJoinedCallIdsByUser(
      userId,
      staleBefore
    );

    for (const staleCall of staleCalls) {
      await this.markTimeout(staleCall.call_id);
    }
  }

  async reconcileDeviceReconnect(userId: number, deviceId: string) {
    const staleBefore = new Date(Date.now() - this.staleDirectCallTimeoutMs);
    const staleCalls = await CallRepository.findStaleActiveCallIdsByDevice(
      userId,
      deviceId,
      staleBefore
    );

    for (const staleCall of staleCalls) {
      await this.forceCloseDeviceCall({
        call_id: staleCall.call_id,
        user_id: userId,
        device_id: deviceId
      });
    }
  }

  private async getCallStateOrThrow(callId: string) {
    const callState = await this.getCallById(callId);
    if (!callState) {
      throw new BusinessError("Call not found");
    }

    return callState;
  }

  private async loadCallState(
    t: DbTx,
    callId: string
  ): Promise<CallStateResult> {
    const session = await t.one<CallSessionRecord>(
      `SELECT id, call_id, conversation_id, call_scope, media_type,
              initiator_user_id, status, active_device_count, participant_count,
              started_at, answered_at, ended_at, end_reason, created_at, updated_at
         FROM call_sessions WHERE call_id = $1`,
      [callId]
    );
    const participants = await t.manyOrNone<CallParticipantRecord>(
      `
      SELECT id, call_id, conversation_id, user_id, device_id, participant_role,
             participant_status, ringing_at, answered_at, joined_at, left_at,
             end_reason, created_at, updated_at
      FROM call_participants
      WHERE call_id = $1
      ORDER BY created_at ASC, id ASC
      `,
      [callId]
    );

    return { session, participants };
  }

  private async forceCloseDeviceCall(params: {
    call_id: string;
    user_id: number;
    device_id: string;
  }) {
    const current = await this.getCallStateOrThrow(params.call_id);
    if (
      current.session.status === CALL_STATUS_CANCELLED ||
      current.session.status === CALL_STATUS_ENDED
    ) {
      return current;
    }

    const now = new Date();
    const isDirectCall = current.session.call_scope === CALL_SCOPE_DIRECT;

    return pg.tx(async (t: DbTx) => {
      await CallRepository.updateParticipantStateForDevice(t, {
        call_id: params.call_id,
        user_id: params.user_id,
        device_id: params.device_id,
        participant_status: CALL_PARTICIPANT_STATUS_LEFT,
        left_at: now,
        end_reason: CALL_END_REASON_FORCE_CLOSED
      });

      if (isDirectCall) {
        await CallRepository.updateRemainingParticipantsForCall(t, {
          call_id: params.call_id,
          exclude_user_id: params.user_id,
          exclude_device_id: params.device_id,
          participant_status: CALL_PARTICIPANT_STATUS_LEFT,
          left_at: now,
          end_reason: CALL_END_REASON_FORCE_CLOSED
        });
      }

      const activeDeviceCount = await CallRepository.countParticipantsByStatus(
        t,
        params.call_id,
        [CALL_PARTICIPANT_STATUS_JOINED]
      );
      const shouldEndCall = isDirectCall
        ? activeDeviceCount <= 0
        : activeDeviceCount <= 1;

      await CallRepository.updateCallSessionState(t, {
        call_id: params.call_id,
        status: shouldEndCall ? CALL_STATUS_ENDED : current.session.status,
        active_device_count: activeDeviceCount,
        ended_at: shouldEndCall ? now : null,
        end_reason: shouldEndCall ? CALL_END_REASON_FORCE_CLOSED : null
      });

      await CallRepository.insertCallEvent(t, {
        call_id: params.call_id,
        conversation_id: current.session.conversation_id,
        event_type: "call.device-reconcile",
        sender_user_id: params.user_id,
        sender_device_id: params.device_id,
        payload: {
          reason: "device_reconnect",
          user_id: params.user_id,
          device_id: params.device_id
        }
      });

      const nextState = await this.loadCallState(t, params.call_id);
      if (shouldEndCall) {
        await this.persistCallRecordMessage(t, nextState, "failed");
      }
      return nextState;
    });
  }

  private async persistCallRecordMessage(
    t: DbTx,
    callState: CallStateResult,
    outcome:
      | "completed"
      | "cancelled"
      | "rejected"
      | "busy"
      | "timeout"
      | "failed"
  ) {
    const conversation = await ConversationCoreRepository.findById(
      callState.session.conversation_id
    );
    if (!conversation) {
      throw new BusinessError("Conversation not found for call record");
    }

    const members =
      await ConversationMemberRepository.findMembersByConversation(
        t,
        callState.session.conversation_id
      );
    if (members.length === 0) {
      return;
    }

    const sequence = await ConversationCoreRepository.nextConversationSequence(
      t,
      callState.session.conversation_id
    );
    const messageId = generateId();
    const durationSeconds = this.getCallDurationSeconds(callState.session);
    const content = {
      type: 0,
      kind: "call_record",
      text: this.buildCallRecordText(callState, outcome),
      call_id: callState.session.call_id,
      scope:
        callState.session.call_scope === CALL_SCOPE_DIRECT ? "direct" : "group",
      media_type:
        callState.session.media_type === CALL_MEDIA_TYPE_AUDIO
          ? "audio"
          : "video",
      initiator_user_id: callState.session.initiator_user_id,
      outcome,
      duration_seconds: durationSeconds,
      started_at: callState.session.started_at.toISOString(),
      ended_at:
        callState.session.ended_at?.toISOString() ?? new Date().toISOString(),
      summary: {
        joined_count: callState.participants.filter(
          participant =>
            participant.participant_status === CALL_PARTICIPANT_STATUS_JOINED ||
            participant.participant_status === CALL_PARTICIPANT_STATUS_LEFT
        ).length,
        declined_count: callState.participants.filter(
          participant =>
            participant.participant_status === CALL_PARTICIPANT_STATUS_DECLINED
        ).length,
        busy_count: callState.participants.filter(
          participant =>
            participant.participant_status === CALL_PARTICIPANT_STATUS_BUSY
        ).length,
        timeout_count: callState.participants.filter(
          participant =>
            participant.participant_status === CALL_PARTICIPANT_STATUS_TIMEOUT
        ).length
      }
    };

    const savedMessage = await MessageRepository.insertMessage(t, {
      id: messageId,
      client_message_id: generateId(),
      conversation_id: callState.session.conversation_id,
      sender_id: 0,
      type: 0,
      content,
      sequence
    });

    await ConversationCoreRepository.updateConversationPointers(t, {
      conversationId: callState.session.conversation_id,
      lastMessageId: savedMessage.id,
      lastMessageAt: savedMessage.created_at
    });

    await ConversationReadStateRepository.applyMessageDeliveryStates(
      t,
      members.map(member => {
        // peer_id 必须按 member 视角计算，而不是用 conversation.peer_id
        // （后者只对查询发起者的视角有意义）。
        const memberUserId = Number(member.user_id);
        const memberPeerId =
          conversation.type === 1
            ? Number(
                members.find(other => Number(other.user_id) !== memberUserId)
                  ?.user_id ?? 0
              )
            : 0;
        return {
          conversation_id: callState.session.conversation_id,
          user_id: member.user_id,
          last_read_seq: 0,
          last_delivered_seq: savedMessage.sequence,
          unread_count: Math.max(savedMessage.sequence, 0),
          peer_id: memberPeerId,
          settings:
            typeof conversation.settings === "string"
              ? conversation.settings
              : null,
          should_unarchive: true,
          clear_draft: false
        };
      })
    );

    await ConversationMemberRepository.backfillMemberJoinSequence(
      t,
      callState.session.conversation_id,
      savedMessage.sequence
    );

    const outboxPayload = mapMessages({
      ...savedMessage,
      client_message_id: savedMessage.client_message_id ?? "",
      client_conversation_id: ""
    } as MessageRecord & {
      client_message_id: string;
      client_conversation_id: string;
    });
    await OutboxRepository.insertEvents(
      t,
      members.map(member => ({
        event_type: "chat.message.deliver",
        message_id: String(savedMessage.id),
        conversation_id: callState.session.conversation_id,
        target_user_id: member.user_id,
        payload: outboxPayload
      }))
    );
  }

  private getCallDurationSeconds(session: CallSessionRecord) {
    const startAt = session.answered_at ?? session.started_at;
    const endAt = session.ended_at ?? new Date();
    return Math.max(
      0,
      Math.round((endAt.getTime() - startAt.getTime()) / 1000)
    );
  }

  private buildCallRecordText(
    callState: CallStateResult,
    outcome:
      | "completed"
      | "cancelled"
      | "rejected"
      | "busy"
      | "timeout"
      | "failed"
  ) {
    const mediaLabel =
      callState.session.media_type === CALL_MEDIA_TYPE_AUDIO
        ? "语音通话"
        : "视频通话";
    const durationSeconds = this.getCallDurationSeconds(callState.session);
    const durationLabel =
      durationSeconds > 0
        ? `，通话时长 ${Math.floor(durationSeconds / 60)
            .toString()
            .padStart(2, "0")}:${(durationSeconds % 60)
            .toString()
            .padStart(2, "0")}`
        : "";

    switch (outcome) {
      case "completed":
        return `${mediaLabel}已结束${durationLabel}`;
      case "cancelled":
        return `${mediaLabel}已取消`;
      case "rejected":
        return `${mediaLabel}已拒绝`;
      case "busy":
        return `${mediaLabel}对方忙线中`;
      case "timeout":
        return `${mediaLabel}无人接听`;
      default:
        return `${mediaLabel}通话失败`;
    }
  }
}

export default new CallService();
