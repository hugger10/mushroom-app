import {
  CALL_SCOPE_DIRECT,
  CALL_SCOPE_GROUP,
  CALL_STATUS_RINGING,
  getCallPhaseFromMessage,
  type CallAcceptRequestMessage,
  type CallInviteRequestMessage,
  type CallMediaType,
  type CallRejectRequestMessage,
  type CallSession,
  type Conversation
} from "@mushroom/shared";
import {
  mobileAppController,
  mobileDeviceId,
  mobileRealtimeClient,
  mobileServerApi
} from "../../services/app-runtime";
import { clearIncomingCallNotification } from "../../platform/notification-center";
import { markSystemCallActive } from "../../platform/system-call";
import { mobileCallSoundPlayer } from "../../platform/call-sound-player";
import {
  createRequestId,
  hasParticipantList,
  hasParticipantUpdate,
  sameUserId
} from "../../utils/app-ui";
import type {
  CallLifecycleMessage,
  MobileCallUiSession
} from "../../types/app";
import { applyConversationDisplayFallbacks } from "../../utils/display";
import type { MobileAppState } from "../../app/controller/useMobileAppState";
import type { createCallMediaActions } from "./call-media-actions";
import type { createCallPermissionActions } from "./call-permissions";
import { i18n } from "../../i18n";

type PermissionActions = ReturnType<typeof createCallPermissionActions>;
type MediaActions = ReturnType<typeof createCallMediaActions>;

function isDefaultCallLabel(label: string) {
  return label === "通话" || label === "Call";
}

export function createCallSessionActions(params: {
  state: MobileAppState;
  permissionActions: PermissionActions;
  mediaActions: MediaActions;
}) {
  const { state, mediaActions } = params;

  function resolveConversationDisplayByServerId(conversationId: string) {
    const matched = state.conversations.find(
      item =>
        item.server_conversation_id === conversationId ||
        item.client_conversation_id === conversationId
    );
    if (!matched) {
      return {
        label: i18n.t("ui.callOverlay.call"),
        avatarUrl: null
      };
    }

    const [normalizedConversation] = applyConversationDisplayFallbacks({
      conversations: [matched],
      contacts: state.friends,
      loginUser: state.snapshot?.auth.user
    });

    return {
      label:
        normalizedConversation?.display_name ||
        normalizedConversation?.name ||
        i18n.t("ui.callOverlay.call"),
      avatarUrl:
        normalizedConversation?.display_avatar ||
        normalizedConversation?.avatar_url ||
        null
    };
  }

  function resolveCallDisplay(
    payload: CallLifecycleMessage,
    current: MobileCallUiSession | null | undefined
  ) {
    const conversationDisplay = resolveConversationDisplayByServerId(
      payload.conversation_id
    );
    const senderContact = state.friends.find(
      friend => Number(friend.user_id) === Number(payload.sender_user_id)
    );
    const currentLabel =
      current?.conversation_label &&
      !isDefaultCallLabel(current.conversation_label)
        ? current.conversation_label
        : undefined;
    const fallbackLabel =
      currentLabel ||
      senderContact?.remark_name ||
      senderContact?.nickname ||
      senderContact?.username ||
      conversationDisplay.label;

    return {
      label: fallbackLabel || i18n.t("ui.callOverlay.call"),
      avatarUrl:
        current?.conversation_avatar_url ||
        senderContact?.avatar_url ||
        conversationDisplay.avatarUrl ||
        null
    };
  }

  function resolveConversationDisplay(conversation: Conversation) {
    const [normalizedConversation] = applyConversationDisplayFallbacks({
      conversations: [conversation],
      contacts: state.friends,
      loginUser: state.snapshot?.auth.user
    });

    return {
      label:
        normalizedConversation?.display_name ||
        normalizedConversation?.name ||
        i18n.t("ui.callOverlay.call"),
      avatarUrl:
        normalizedConversation?.display_avatar ||
        normalizedConversation?.avatar_url ||
        null
    };
  }

  function getCallTargetUserIds(conversation: Conversation) {
    const memberIds = new Set<number>();

    for (const member of conversation.members ?? []) {
      if (!sameUserId(member.user_id, state.snapshot?.auth.user?.userId)) {
        memberIds.add(Number(member.user_id));
      }
    }

    if (conversation.type === 1 && conversation.peer_id) {
      memberIds.add(Number(conversation.peer_id));
    }

    return Array.from(memberIds);
  }

  async function refreshDirectCallIceConfig() {
    try {
      const result = await mobileServerApi.getCallIceConfig();
      state.setCallIceInfo(result.data);
    } catch {
      state.setCallIceInfo(null);
    }
  }

  async function refreshGroupCallRoomConfig(callId: string) {
    try {
      const result = await mobileServerApi.getCallRoomConfig({ callId });
      state.setCallRoomInfo(result.data);
    } catch {
      state.setCallRoomInfo(null);
    }
  }

  function upsertCallSession(
    direction: "incoming" | "outgoing",
    payload: CallLifecycleMessage
  ): MobileCallUiSession {
    const nextPhase = getCallPhaseFromMessage(payload);

    // Compute from the authoritative `callSessionRef.current` mirror (kept in
    // sync synchronously throughout this module) rather than a functional
    // `setState` updater, so the freshly built session can be returned to the
    // caller without depending on React's updater-evaluation timing. Cold-start
    // answer paths read this return value immediately.
    const current = state.callSessionRef.current;
    const isSameSession = current?.call_id === payload.call_id;
    const callDisplay = resolveCallDisplay(payload, current);
    const nextParticipants = hasParticipantList(payload)
      ? payload.participants
      : hasParticipantUpdate(payload) && isSameSession && current
        ? current.participants.some(
            participant =>
              sameUserId(participant.user_id, payload.participant.user_id) &&
              participant.device_id === payload.participant.device_id
          )
          ? current.participants.map(participant =>
              sameUserId(participant.user_id, payload.participant.user_id) &&
              participant.device_id === payload.participant.device_id
                ? payload.participant
                : participant
            )
          : [...current.participants, payload.participant]
        : isSameSession && current
          ? current.participants
          : [];

    const nextSession: MobileCallUiSession = {
      call_id: payload.call_id,
      conversation_id: payload.conversation_id,
      call_scope: payload.call_scope,
      media_type: payload.session.media_type,
      requested_media_type:
        isSameSession && current
          ? current.requested_media_type
          : payload.media_type,
      direction: isSameSession && current ? current.direction : direction,
      phase: nextPhase,
      conversation_label: callDisplay.label,
      conversation_avatar_url: callDisplay.avatarUrl,
      session: payload.session,
      participants: nextParticipants,
      local_audio_enabled:
        isSameSession && current ? current.local_audio_enabled : undefined,
      local_video_enabled:
        isSameSession && current ? current.local_video_enabled : undefined,
      local_participation_mode:
        isSameSession && current ? current.local_participation_mode : undefined
    };

    state.callSessionRef.current = nextSession;
    state.setCallSession(nextSession);

    if (nextPhase === "ringing" || nextPhase === "ongoing") {
      state.clearCallDismissTimer();
    }

    if (payload.call_scope === CALL_SCOPE_GROUP && nextPhase === "ongoing") {
      void refreshGroupCallRoomConfig(payload.call_id);
    } else if (payload.call_scope === CALL_SCOPE_DIRECT) {
      void refreshDirectCallIceConfig();
    }

    return nextSession;
  }

  async function handleStartCall(
    conversation: Conversation,
    requestedMediaType: CallMediaType,
    options?: { targetUserIds?: number[] }
  ) {
    if (!state.snapshot?.auth.user) {
      return;
    }

    const targetUserIds =
      options?.targetUserIds && options.targetUserIds.length > 0
        ? options.targetUserIds
        : getCallTargetUserIds(conversation);
    if (targetUserIds.length === 0) {
      state.setError(i18n.t("callActions.noCallableMembers"));
      return;
    }

    state.dismissCallSessionNow();

    const prepared = await mediaActions.prepareLocalCallMedia({
      requestedMediaType,
      context: "start"
    });

    if (prepared.notice) {
      state.setStatus("");
    }

    const payload: CallInviteRequestMessage = {
      messageClassify: "call.invite.request",
      call_id: createRequestId(),
      conversation_id: conversation.server_conversation_id,
      call_scope:
        conversation.type === 2 ? CALL_SCOPE_GROUP : CALL_SCOPE_DIRECT,
      media_type: prepared.effectiveMediaType,
      sender_user_id: state.snapshot.auth.user.userId,
      sender_device_id: mobileDeviceId,
      request_id: createRequestId(),
      timestamp: new Date().toISOString(),
      target_user_ids: targetUserIds
    };

    const optimisticSession: CallSession = {
      call_id: payload.call_id,
      conversation_id: payload.conversation_id,
      call_scope: payload.call_scope,
      media_type: prepared.effectiveMediaType,
      initiator_user_id: state.snapshot.auth.user.userId,
      status: CALL_STATUS_RINGING,
      active_device_count: 1,
      participant_count: targetUserIds.length + 1,
      started_at: payload.timestamp,
      answered_at: null,
      ended_at: null,
      end_reason: null,
      created_at: payload.timestamp,
      updated_at: payload.timestamp
    };
    const conversationDisplay = resolveConversationDisplay(conversation);

    const nextSession: MobileCallUiSession = {
      call_id: payload.call_id,
      conversation_id: payload.conversation_id,
      call_scope: payload.call_scope,
      media_type: prepared.effectiveMediaType,
      requested_media_type: requestedMediaType,
      direction: "outgoing",
      phase: "ringing",
      conversation_label: conversationDisplay.label,
      conversation_avatar_url: conversationDisplay.avatarUrl,
      session: optimisticSession,
      participants: [],
      local_audio_enabled: prepared.localAudioEnabled,
      local_video_enabled: prepared.localVideoEnabled,
      local_participation_mode: prepared.localParticipationMode
    };
    state.callSessionRef.current = nextSession;
    state.setCallSession(nextSession);
    void mobileCallSoundPlayer.playLoop("outgoing");

    if (payload.call_scope === CALL_SCOPE_GROUP) {
      state.setCallRoomInfo(null);
    } else {
      void refreshDirectCallIceConfig();
    }

    await mobileRealtimeClient.sendMessage(payload);
    state.setStatus("");
  }

  async function handleAcceptCall() {
    if (!state.snapshot?.auth.user || !state.callSessionRef.current) {
      return;
    }

    void clearIncomingCallNotification(state.callSessionRef.current.call_id);
    await mobileCallSoundPlayer.stopAll();
    const prepared = await mediaActions.prepareLocalCallMedia({
      requestedMediaType: state.callSessionRef.current.requested_media_type,
      context: "accept"
    });

    const payload: CallAcceptRequestMessage = {
      messageClassify: "call.accept.request",
      call_id: state.callSessionRef.current.call_id,
      conversation_id: state.callSessionRef.current.conversation_id,
      call_scope: state.callSessionRef.current.call_scope,
      media_type: prepared.effectiveMediaType,
      sender_user_id: state.snapshot.auth.user.userId,
      sender_device_id: mobileDeviceId,
      request_id: createRequestId(),
      timestamp: new Date().toISOString(),
      local_audio_enabled: prepared.localAudioEnabled,
      local_video_enabled: prepared.localVideoEnabled
    };

    await mobileRealtimeClient.sendMessage(payload);
    // Optimistically activate the system (CallKit/ConnectionService) call right
    // after answering, for every accept path (foreground CallOverlay tap and
    // the by-id system-answer). On iOS CallKit this activates the audio session
    // immediately instead of waiting for the accept → server `call.accepted` →
    // WebRTC `ongoing` round-trip, which can be slow on a cold-start/offline
    // answer and would otherwise leave CallKit in "connecting" with no audio.
    // Idempotent: the realtime `ongoing` phase handler also calls this.
    void markSystemCallActive(state.callSessionRef.current.call_id);
    state.setCallSession(current =>
      current
        ? (() => {
            const nextSession: MobileCallUiSession = {
              ...current,
              direction: "incoming",
              phase: "ongoing",
              media_type:
                current.call_scope === CALL_SCOPE_GROUP
                  ? current.media_type
                  : prepared.effectiveMediaType,
              local_audio_enabled: prepared.localAudioEnabled,
              local_video_enabled: prepared.localVideoEnabled,
              local_participation_mode: prepared.localParticipationMode
            };
            state.callSessionRef.current = nextSession;
            return nextSession;
          })()
        : current
    );
    void mobileCallSoundPlayer.playOnce("connected");
    state.setStatus("");
  }

  async function handleRejectCall() {
    if (!state.snapshot?.auth.user || !state.callSessionRef.current) {
      return;
    }

    void clearIncomingCallNotification(state.callSessionRef.current.call_id);
    await mobileCallSoundPlayer.stopAll();
    const payload: CallRejectRequestMessage = {
      messageClassify: "call.reject.request",
      call_id: state.callSessionRef.current.call_id,
      conversation_id: state.callSessionRef.current.conversation_id,
      call_scope: state.callSessionRef.current.call_scope,
      media_type: state.callSessionRef.current.media_type,
      sender_user_id: state.snapshot.auth.user.userId,
      sender_device_id: mobileDeviceId,
      request_id: createRequestId(),
      timestamp: new Date().toISOString()
    };

    await mobileRealtimeClient.sendMessage(payload);
    mediaActions.releaseCallMedia();
    state.dismissCallSessionNow();
    void mobileCallSoundPlayer.playOnce("rejected");
    state.setStatus("");
  }

  async function handleEndCall() {
    if (!state.snapshot?.auth.user || !state.callSessionRef.current) {
      return;
    }

    void clearIncomingCallNotification(state.callSessionRef.current.call_id);
    await mobileCallSoundPlayer.stopAll();
    const payload = {
      messageClassify: "call.end.request",
      call_id: state.callSessionRef.current.call_id,
      conversation_id: state.callSessionRef.current.conversation_id,
      call_scope: state.callSessionRef.current.call_scope,
      media_type: state.callSessionRef.current.media_type,
      sender_user_id: state.snapshot.auth.user.userId,
      sender_device_id: mobileDeviceId,
      request_id: createRequestId(),
      timestamp: new Date().toISOString()
    } as const;

    await mobileRealtimeClient.sendMessage(payload);
    mediaActions.releaseCallMedia();
    state.setCallSession(current =>
      current
        ? (() => {
            const nextSession: MobileCallUiSession = {
              ...current,
              phase: "ended"
            };
            state.callSessionRef.current = nextSession;
            return nextSession;
          })()
        : current
    );
    state.setStatus("");
    void mobileCallSoundPlayer.playOnce("hangup");
    void mobileAppController.syncNow();
    state.clearCallDismissTimer();
    state.callDismissTimerRef.current = setTimeout(() => {
      state.dismissCallSessionNow();
    }, 1200);
  }

  async function handleToggleLocalCallMedia(kind: "audio" | "video") {
    if (!state.snapshot?.auth.user || !state.callSessionRef.current) {
      return;
    }

    const nextState = await mediaActions.toggleLocalCallMedia(kind);
    if (!nextState) {
      return;
    }

    state.setCallSession(current =>
      current
        ? (() => {
            const nextSession: MobileCallUiSession = {
              ...current,
              local_audio_enabled: nextState.localAudioEnabled,
              local_video_enabled: nextState.localVideoEnabled,
              local_participation_mode: nextState.localParticipationMode
            };
            state.callSessionRef.current = nextSession;
            return nextSession;
          })()
        : current
    );
  }

  return {
    upsertCallSession,
    handleStartCall,
    handleAcceptCall,
    handleRejectCall,
    handleEndCall,
    handleToggleLocalCallMedia
  };
}
