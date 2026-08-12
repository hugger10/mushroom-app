import WebSocket from "ws";
import type {
  AnswerMessage,
  CallErrorMessage,
  CallMediaStateMessage,
  CallMediaType,
  ClientWsMessage,
  IceMessage,
  OfferMessage,
  ServerWsMessage
} from "@mushroom/shared";
import {
  CALL_END_REASON_BUSY,
  CALL_PARTICIPANT_STATUS_BUSY,
  CALL_PARTICIPANT_STATUS_RINGING,
  CALL_PARTICIPANT_STATUS_TIMEOUT,
  CALL_SCOPE_DIRECT,
  CALL_STATUS_ENDED,
  type CallAcceptRequestMessage,
  type CallEndRequestMessage,
  type CallInviteRequestMessage,
  type CallMediaStateRequestMessage,
  type CallRejectRequestMessage,
  type TypingMessage
} from "@mushroom/shared";
import { BusinessError } from "../handler/business_error";
import ConversationMemberRepository from "../repository/conversation/conversation_member_repository";
import OutboxRepository from "../repository/outbox_repository";
import UserDeviceRepository from "../repository/user_device_repository";
import UserRepository from "../repository/user_repository";
import CallRoomService from "../service/call_room_service";
import CallService, { type CallStateResult } from "../service/call_service";
import PushNotificationService from "../service/push_notification_service";
import logger from "../utils/logger";
import { getRequestLogger } from "../utils/log_context";
import {
  buildCallAcceptedMessage,
  buildCallBusyMessage,
  buildCallEndedMessage,
  buildCallInvitedMessage,
  buildCallRejectedMessage,
  buildCallStateSyncMessage,
  buildCallTimeoutMessage,
  findParticipantForDevice,
  type CallBroadcastMessage
} from "./call_messages";
import type { Client, WebSocketDeliveryOptions } from "./types";

export class WebSocketCallHandler {
  private readonly callTimeouts = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();

  /** 存原始邀请请求数据（按 call_id 索引），供 handleCallAccept
   *  重新调度振铃超时，让尚未应答的参与者获得一个新的超时窗口。 */
  private readonly callInviteData = new Map<string, CallInviteRequestMessage>();

  /**
   * Per-(conversation, sender) throttle for typing fan-out. We allow active
   * frames at most every {@link TYPING_THROTTLE_MS}; idle frames are always
   * forwarded so listeners can promptly hide the indicator.
   */
  private readonly typingLastSentAt = new Map<string, number>();
  private static readonly TYPING_THROTTLE_MS = 1500;
  private static readonly TYPING_THROTTLE_MAX_ENTRIES = 5000;

  constructor(
    private readonly directCallTimeoutMs: number,
    private readonly dispatchToUser: (
      userId: number | string,
      data: ServerWsMessage,
      options?: WebSocketDeliveryOptions
    ) => Promise<unknown>,
    private readonly getOnlineDeviceIds: (userId: number) => Promise<string[]>
  ) {}

  async close() {
    for (const timer of this.callTimeouts.values()) {
      clearTimeout(timer);
    }
    this.callTimeouts.clear();
    this.callInviteData.clear();
  }

  async handleCallInvite(
    client: Client,
    deviceId: string,
    data: CallInviteRequestMessage
  ) {
    this.assertSenderMatchesConnection(client, deviceId, data);
    if (data.call_scope !== CALL_SCOPE_DIRECT) {
      CallRoomService.assertGroupCallingConfigured();
    }

    const targetUserIds =
      data.call_scope === CALL_SCOPE_DIRECT && data.target_user_ids.length === 0
        ? []
        : data.target_user_ids;

    const targets = (
      await Promise.all(
        targetUserIds.map(async userId => {
          const isBusy = await CallService.isUserBusy(userId);
          const devices = await UserDeviceRepository.listByUser(userId);
          const activeDeviceIds = devices
            .filter(device => Number(device.status) === 1)
            .map(device => device.device_id)
            .filter(Boolean);
          const onlineDeviceIds = await this.getOnlineDeviceIds(userId);
          const deviceIds = Array.from(
            new Set(
              activeDeviceIds.length > 0 ? activeDeviceIds : onlineDeviceIds
            )
          );
          return deviceIds.map(targetDeviceId => ({
            user_id: userId,
            device_id: targetDeviceId,
            participant_status: isBusy
              ? CALL_PARTICIPANT_STATUS_BUSY
              : CALL_PARTICIPANT_STATUS_RINGING,
            end_reason: isBusy ? CALL_END_REASON_BUSY : null
          }));
        })
      )
    ).flat();

    const callState = await CallService.createCall({
      call_id: data.call_id,
      conversation_id: data.conversation_id,
      call_scope: data.call_scope,
      media_type: data.media_type,
      initiator_user_id: data.sender_user_id,
      initiator_device_id: data.sender_device_id,
      targets,
      request_id: data.request_id,
      payload: data
    });

    const invitedMessage = buildCallInvitedMessage(
      data,
      callState,
      this.directCallTimeoutMs
    );
    for (const userId of new Set(targetUserIds)) {
      await this.dispatchToUser(userId, invitedMessage);
    }

    const senderProfile = await UserRepository.findById(data.sender_user_id);
    const senderName =
      senderProfile?.nickname || senderProfile?.username || "新来电";

    await OutboxRepository.insertEvents(
      undefined,
      Array.from(new Set(targetUserIds)).map(userId => ({
        event_type: "push.notification",
        conversation_id: data.conversation_id,
        target_user_id: userId,
        payload: PushNotificationService.buildIncomingCallNotification({
          callId: data.call_id,
          conversationId: data.conversation_id,
          senderUserId: data.sender_user_id,
          senderDeviceId: data.sender_device_id,
          timeoutSeconds: Math.round(this.directCallTimeoutMs / 1000),
          mediaType: data.media_type,
          callScope: data.call_scope,
          senderName
        })
      }))
    );

    const busyParticipants = callState.participants.filter(
      participant =>
        participant.user_id !== data.sender_user_id &&
        participant.participant_status === CALL_PARTICIPANT_STATUS_BUSY
    );

    const hasRingingParticipants = callState.participants.some(
      participant =>
        participant.user_id !== data.sender_user_id &&
        participant.participant_status === CALL_PARTICIPANT_STATUS_RINGING
    );
    if (
      data.call_scope === CALL_SCOPE_DIRECT &&
      !hasRingingParticipants &&
      busyParticipants.length > 0
    ) {
      const finalizedBusyState = await CallService.finalizeBusyInviteCall({
        call_id: data.call_id,
        request_id: data.request_id,
        payload: data
      });
      await this.dispatchToUser(
        data.sender_user_id,
        buildCallBusyMessage(
          data,
          finalizedBusyState,
          findParticipantForDevice(
            finalizedBusyState,
            busyParticipants[0].user_id,
            busyParticipants[0].device_id
          )
        )
      );
      await this.broadcastCallStateSync(data, finalizedBusyState);
      return;
    }

    for (const participant of busyParticipants) {
      await this.dispatchToUser(
        data.sender_user_id,
        buildCallBusyMessage(data, callState, participant)
      );
    }

    this.callInviteData.set(data.call_id, data);
    this.scheduleCallTimeout(data, callState);
    await this.broadcastCallStateSync(data, callState);
    getRequestLogger().info(
      {
        callId: data.call_id,
        conversationId: data.conversation_id,
        callScope: data.call_scope,
        mediaType: data.media_type,
        senderUserId: data.sender_user_id,
        targetUserIds
      },
      "Call invited"
    );
  }

  async handleCallAccept(
    client: Client,
    deviceId: string,
    data: CallAcceptRequestMessage
  ) {
    this.assertSenderMatchesConnection(client, deviceId, data);

    if (data.call_scope !== CALL_SCOPE_DIRECT) {
      CallRoomService.assertGroupCallingConfigured();
    }

    const callState = await CallService.acceptCall({
      call_id: data.call_id,
      user_id: data.sender_user_id,
      device_id: data.sender_device_id,
      media_type: data.media_type,
      request_id: data.request_id,
      payload: data
    });

    const participant = findParticipantForDevice(
      callState,
      data.sender_user_id,
      data.sender_device_id
    );
    const acceptedMessage = buildCallAcceptedMessage(
      data,
      callState,
      participant
    );
    await this.broadcastToCallParticipants(callState, acceptedMessage);
    await this.broadcastCallStateSync(data, callState);

    // 群通话接受后重新调度振铃超时，给其余未应答者一个新的计时窗口
    const inviteData = this.callInviteData.get(data.call_id);
    if (inviteData) {
      this.scheduleCallTimeout(inviteData, callState);
    }

    getRequestLogger().info(
      {
        callId: data.call_id,
        senderUserId: data.sender_user_id,
        senderDeviceId: data.sender_device_id
      },
      "Call accepted"
    );
  }

  async handleCallReject(
    client: Client,
    deviceId: string,
    data: CallRejectRequestMessage
  ) {
    this.assertSenderMatchesConnection(client, deviceId, data);

    const callState = await CallService.rejectCall({
      call_id: data.call_id,
      user_id: data.sender_user_id,
      device_id: data.sender_device_id,
      request_id: data.request_id,
      payload: data
    });

    const participant = findParticipantForDevice(
      callState,
      data.sender_user_id,
      data.sender_device_id
    );
    const rejectedMessage = buildCallRejectedMessage(
      data,
      callState,
      participant
    );
    if (callState.session.status === CALL_STATUS_ENDED) {
      this.clearCallTimeout(data.call_id);
      this.callInviteData.delete(data.call_id);
    }
    await this.broadcastToCallParticipants(callState, rejectedMessage);
    await this.broadcastCallStateSync(data, callState);
    getRequestLogger().info(
      {
        callId: data.call_id,
        senderUserId: data.sender_user_id,
        ended: callState.session.status === CALL_STATUS_ENDED
      },
      "Call rejected"
    );
  }

  async handleCallEnd(
    client: Client,
    deviceId: string,
    data: CallEndRequestMessage
  ) {
    this.assertSenderMatchesConnection(client, deviceId, data);

    const callState = await CallService.endCall({
      call_id: data.call_id,
      user_id: data.sender_user_id,
      device_id: data.sender_device_id,
      request_id: data.request_id,
      payload: data
    });

    const endedMessage = buildCallEndedMessage(data, callState);
    if (callState.session.status === CALL_STATUS_ENDED) {
      this.clearCallTimeout(data.call_id);
      this.callInviteData.delete(data.call_id);
    }
    await this.broadcastToCallParticipants(callState, endedMessage);
    await this.broadcastCallStateSync(data, callState);
    getRequestLogger().info(
      {
        callId: data.call_id,
        senderUserId: data.sender_user_id,
        status: callState.session.status
      },
      "Call ended"
    );
  }

  async handleCallSignal(
    client: Client,
    deviceId: string,
    data: OfferMessage | AnswerMessage | IceMessage
  ) {
    this.assertSenderMatchesConnection(client, deviceId, data);

    await this.dispatchToUser(data.target_user_id, data, {
      targetDeviceId: data.target_device_id
    });
  }

  async handleCallMediaState(
    client: Client,
    deviceId: string,
    data: CallMediaStateRequestMessage
  ) {
    this.assertSenderMatchesConnection(client, deviceId, data);

    const callState = await CallService.getCallById(data.call_id);
    if (!callState || callState.session.status === CALL_STATUS_ENDED) {
      return;
    }

    const mediaStateMessage: CallMediaStateMessage = {
      messageClassify: "call.media-state",
      call_id: data.call_id,
      conversation_id: data.conversation_id,
      call_scope: data.call_scope,
      media_type: callState.session.media_type as CallMediaType,
      sender_user_id: data.sender_user_id,
      sender_device_id: data.sender_device_id,
      request_id: data.request_id,
      timestamp: new Date().toISOString(),
      audio_enabled: data.audio_enabled,
      video_enabled: data.video_enabled,
      participation_mode: data.participation_mode
    };

    await this.broadcastToCallParticipants(callState, mediaStateMessage);
  }

  async handleTyping(client: Client, data: TypingMessage) {
    if (data.sender_user_id !== client.userId) {
      throw new Error("sender_user_id does not match authenticated user");
    }

    const conversationId = String(data.conversation_id || "");
    if (!conversationId) {
      return;
    }

    // Throttle active frames per (conversation, sender). Idle frames are
    // always allowed through so the indicator clears promptly.
    if (data.active) {
      const key = `${conversationId}:${data.sender_user_id}`;
      const now = Date.now();
      const lastAt = this.typingLastSentAt.get(key) ?? 0;
      if (now - lastAt < WebSocketCallHandler.TYPING_THROTTLE_MS) {
        return;
      }
      this.typingLastSentAt.set(key, now);
      // Cheap eviction to bound memory; typing is best-effort.
      if (
        this.typingLastSentAt.size >
        WebSocketCallHandler.TYPING_THROTTLE_MAX_ENTRIES
      ) {
        const firstKey = this.typingLastSentAt.keys().next().value;
        if (firstKey !== undefined) {
          this.typingLastSentAt.delete(firstKey);
        }
      }
    }

    // Resolve fan-out targets by conversation membership. For 1:1 this
    // naturally becomes a single peer; for group it spans all active members
    // (sender excluded). Falls back to the legacy `target_user_id` only when
    // membership lookup fails (e.g. transient DB issue) to preserve backward
    // compatibility with older clients.
    let targetUserIds: number[] = [];
    try {
      const members =
        await ConversationMemberRepository.findMembers(conversationId);
      targetUserIds = members
        .map(member => Number(member.user_id))
        .filter(userId => userId && userId !== data.sender_user_id);
    } catch (error) {
      getRequestLogger().warn(
        { error, conversationId },
        "typing fan-out membership lookup failed; falling back to target_user_id"
      );
    }

    if (targetUserIds.length === 0 && data.target_user_id) {
      targetUserIds = [Number(data.target_user_id)];
    }

    if (targetUserIds.length === 0) {
      return;
    }

    // Drop the deprecated `target_user_id` from the outbound payload so the
    // receiver-side state can key by sender alone.
    const { target_user_id: _legacyTarget, ...rest } = data;
    void _legacyTarget;
    const payload: TypingMessage = {
      ...rest,
      timestamp: new Date().toISOString()
    };

    await Promise.all(
      targetUserIds.map(userId => this.dispatchToUser(userId, payload))
    );
  }

  trySendCallError(
    ws: WebSocket,
    data: ClientWsMessage | null,
    error: unknown
  ) {
    if (!data || !String(data.messageClassify).startsWith("call.")) {
      return;
    }

    const payload: CallErrorMessage = {
      messageClassify: "call.error",
      call_id: "call_id" in data ? data.call_id : undefined,
      conversation_id:
        "conversation_id" in data ? data.conversation_id : undefined,
      request_id: "request_id" in data ? data.request_id : undefined,
      code:
        error instanceof BusinessError ? "call_business_error" : "call_error",
      message:
        error instanceof Error
          ? error.message
          : "当前通话请求处理失败，请稍后重试",
      timestamp: new Date().toISOString()
    };

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
    getRequestLogger().warn(
      {
        err: error,
        callId: payload.call_id,
        conversationId: payload.conversation_id,
        classify: data.messageClassify
      },
      "Call request failed"
    );
  }

  private assertSenderMatchesConnection(
    client: Client,
    deviceId: string,
    data: { sender_user_id: number; sender_device_id: string }
  ) {
    if (data.sender_user_id !== client.userId) {
      throw new Error("sender_user_id does not match authenticated user");
    }
    if (data.sender_device_id !== deviceId) {
      throw new Error("sender_device_id does not match current device");
    }
  }

  private async broadcastCallStateSync(
    data:
      | CallInviteRequestMessage
      | CallAcceptRequestMessage
      | CallRejectRequestMessage
      | CallEndRequestMessage,
    callState: CallStateResult
  ) {
    await this.broadcastToCallParticipants(
      callState,
      buildCallStateSyncMessage(data, callState)
    );
  }

  private async broadcastToCallParticipants(
    callState: CallStateResult,
    data: CallBroadcastMessage
  ) {
    const userIds = new Set(callState.participants.map(item => item.user_id));
    for (const userId of userIds) {
      await this.dispatchToUser(userId, data);
    }
  }

  private scheduleCallTimeout(
    data: CallInviteRequestMessage,
    callState: CallStateResult
  ) {
    const hasRingingParticipants = callState.participants.some(
      participant =>
        participant.participant_status === CALL_PARTICIPANT_STATUS_RINGING
    );
    const hasNoResolvedTargets =
      data.target_user_ids.length > 0 &&
      callState.participants.every(
        participant =>
          Number(participant.user_id) === Number(data.sender_user_id)
      );

    if (!hasRingingParticipants && !hasNoResolvedTargets) {
      return;
    }

    this.clearCallTimeout(data.call_id);
    const timer = setTimeout(() => {
      void this.handleScheduledCallTimeout(data).catch(error => {
        logger.error(
          { err: error, callId: data.call_id },
          "Failed to process scheduled call timeout"
        );
      });
    }, this.directCallTimeoutMs);
    this.callTimeouts.set(data.call_id, timer);
  }

  private clearCallTimeout(callId: string) {
    const timer = this.callTimeouts.get(callId);
    if (!timer) {
      return;
    }

    clearTimeout(timer);
    this.callTimeouts.delete(callId);
  }

  private async handleScheduledCallTimeout(data: CallInviteRequestMessage) {
    this.callTimeouts.delete(data.call_id);
    this.callInviteData.delete(data.call_id);

    const current = await CallService.getCallById(data.call_id);
    if (!current) {
      return;
    }
    const hasRingingParticipants = current.participants.some(
      participant =>
        participant.participant_status === CALL_PARTICIPANT_STATUS_RINGING
    );
    const hasNoResolvedTargets =
      data.target_user_ids.length > 0 &&
      current.participants.every(
        participant =>
          Number(participant.user_id) === Number(data.sender_user_id)
      );

    if (
      current.session.status === CALL_STATUS_ENDED ||
      (!hasRingingParticipants && !hasNoResolvedTargets)
    ) {
      return;
    }

    const nextState = await CallService.markTimeout(data.call_id);
    const callEndedByTimeout = nextState.session.status === CALL_STATUS_ENDED;

    // Find the user IDs of participants who were actually timed out.
    const timedOutUserIds = new Set(
      nextState.participants
        .filter(
          p =>
            p.participant_status === CALL_PARTICIPANT_STATUS_TIMEOUT &&
            p.user_id !== data.sender_user_id
        )
        .map(p => p.user_id)
    );

    if (callEndedByTimeout) {
      // Entire call ended — broadcast timeout to everyone.
      const timedOutParticipant = nextState.participants.find(
        p =>
          p.user_id !== data.sender_user_id &&
          p.participant_status === CALL_PARTICIPANT_STATUS_TIMEOUT
      );
      await this.broadcastToCallParticipants(
        nextState,
        buildCallTimeoutMessage(data, nextState, timedOutParticipant)
      );
    } else {
      // Call continues (at least one joined participant). Only send
      // `call.timeout` to the participants who didn't answer, so their
      // UI shows "无人接听". Joined participants should not be disturbed.
      for (const userId of timedOutUserIds) {
        await this.dispatchToUser(
          userId,
          buildCallTimeoutMessage(data, nextState)
        );
      }
    }

    await this.broadcastCallStateSync(data, nextState);
  }
}
