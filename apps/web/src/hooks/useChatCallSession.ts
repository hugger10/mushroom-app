import { message as antdMessage } from "antd";
import log from "@/utils/log";
import { useCallback, useEffect, type RefObject } from "react";
import { v4 as uuidv4 } from "uuid";
import {
  CALL_MEDIA_TYPE_AUDIO,
  CALL_MEDIA_TYPE_VIDEO,
  CALL_SCOPE_DIRECT,
  CALL_SCOPE_GROUP,
  CALL_STATUS_RINGING,
  resolveCallParticipationMode
} from "@mushroom/shared";
import type {
  CallAcceptRequestMessage,
  CallEndRequestMessage,
  CallInviteRequestMessage,
  CallMediaType,
  CallRejectRequestMessage,
  CallScope,
  CallSession
} from "@mushroom/shared";
import type { Conversation } from "../types/chat";
import type { LoginUser } from "../types/user";
import type { WsUiState } from "../ws/WSClient";
import { callSoundPlayer } from "../utils/callSoundPlayer";
import { useCallSessionState } from "./call/useCallSessionState";
import { useCallMediaLifecycle } from "./call/useCallMediaLifecycle";
import { useDirectCallSignaling } from "./call/useDirectCallSignaling";
import { useGroupCallRoom } from "./call/useGroupCallRoom";
import { useCallWsBridge } from "./call/useCallWsBridge";
import {
  wsCallSignalTransport,
  type CallSignalTransport
} from "./call/callSignalTransport";
import { getCallTargetUserIds as getCallTargetUserIdsFromConversation } from "./call/callSession";
import type { PreparedLocalCallMedia } from "./call/callMedia";
import { i18n } from "../i18n";

const callLog = log.scope("call");

type UseCallSessionOptions = {
  loginUser: LoginUser | null;
  conversationsRef: RefObject<Conversation[]>;
  wsUiStateRef: RefObject<WsUiState>;
  /**
   * 通话信令传输。默认使用主窗 WS 实现；独立通话窗（P2）注入 IPC 中转实现。
   */
  transport?: CallSignalTransport;
};

/**
 * 通话会话编排层（薄壳）。
 *
 * 拆分为 5 个子 hook + 2 个纯模块：
 *   - useCallSessionState     : 会话 FSM + 自动消解
 *   - useCallMediaLifecycle   : 本地媒体获取/降级
 *   - useDirectCallSignaling  : 1:1 PeerConnection 编排
 *   - useGroupCallRoom        : LiveKit 群通房间
 *   - useCallWsBridge         : 出向信令 + 入向消息分发
 *   - callIceServers          : ICE 服务器缓存（纯模块）
 *   - callIceDiagnostics      : ICE 候选成败聚合日志（纯模块）
 *
 * 顶层负责：
 *   1. 串联依赖（wsBridge.attachHandlers / state.registerOnDismiss）
 *   2. 4 个用户动作（start / accept / reject / end）—— 横跨多模块
 *   3. 暴露 11 个对外字段（公共 API 保持不变）
 */
export function useChatCallSession({
  loginUser,
  conversationsRef,
  wsUiStateRef,
  transport = wsCallSignalTransport
}: UseCallSessionOptions) {
  const state = useCallSessionState({ conversationsRef });
  const media = useCallMediaLifecycle({
    getSession: state.getSession,
    setSession: state.setCallSession
  });
  const wsBridge = useCallWsBridge({ loginUser, transport });
  const direct = useDirectCallSignaling({
    loginUser,
    getSession: state.getSession,
    getLocalStream: media.getLocalStream,
    sendCallSignal: wsBridge.sendCallSignal
  });
  const group = useGroupCallRoom({
    loginUser,
    conversationsRef,
    callSession: state.callSession,
    getSession: state.getSession,
    getLocalStream: media.getLocalStream,
    localCallStream: media.localCallStream,
    getCurrentDeviceId: wsBridge.getCurrentDeviceId
  });

  // late-binding: 把下游能力注入 wsBridge（解决 wsBridge ↔ transport 循环）。
  // 在 useEffect 中执行，确保 render 期间不触发副作用；每次依赖变化时刷新
  // handlersRef，避免 stale closure。
  useEffect(() => {
    wsBridge.attachHandlers({
      getSession: state.getSession,
      setSession: state.setCallSession,
      upsertSession: state.upsertCallSession,
      dismissNow: state.dismissCallSessionNow,
      resolveConversationLabel: state.resolveConversationLabel,
      createOfferForCall: direct.createOfferForCall,
      applySignalDescription: direct.applySignalDescription,
      applyIceCandidate: direct.applyIceCandidate,
      hasActivePeerConnection: direct.hasActivePeerConnection,
      hasActiveLiveKitRoom: group.hasRoom
    });
  }, [direct, group, state, wsBridge]);

  // 注册 dismiss 联动清理：本地媒体 + Peer + Group Room
  useEffect(() => {
    state.registerOnDismiss(() => {
      media.replaceLocalStream(null);
      direct.closePeerConnection();
      void group.disconnect();
    });
    return () => {
      state.registerOnDismiss(null);
    };
  }, [direct, group, media, state]);

  // ongoing 阶段广播本地媒体状态变化
  useEffect(() => {
    const session = state.callSession;
    if (!session || session.phase !== "ongoing") {
      return;
    }
    void wsBridge.broadcastLocalCallMediaState(session).catch(error => {
      callLog.warn("Failed to broadcast local call media state", {
        callId: session.call_id,
        error: error instanceof Error ? error.message : String(error)
      });
    });
  }, [state.callSession, wsBridge]);

  // ===================== 用户动作 =====================

  const handleStartCall = useCallback(
    async (
      conversation: Conversation,
      mediaType: CallMediaType,
      options?: { targetUserIds?: number[] }
    ) => {
      if (!loginUser) {
        return;
      }
      if (wsUiStateRef.current?.status !== "connected") {
        antdMessage.error(i18n.t("callActions.cannotStartCall"));
        return;
      }

      const targetUserIds =
        options?.targetUserIds && options.targetUserIds.length > 0
          ? options.targetUserIds
          : getCallTargetUserIdsFromConversation(
              conversation,
              loginUser.userId
            );
      if (targetUserIds.length === 0) {
        antdMessage.error(i18n.t("callActions.noCallableMembers"));
        return;
      }

      direct.closePeerConnection();

      const callScope: CallScope =
        conversation.type === 2 ? CALL_SCOPE_GROUP : CALL_SCOPE_DIRECT;
      let preparedMedia: PreparedLocalCallMedia;
      try {
        preparedMedia = await media.prepareLocalMedia({
          requestedMediaType: mediaType,
          context: "start"
        });
      } catch (error) {
        antdMessage.error(
          error instanceof Error
            ? error.message
            : i18n.t("callActions.micCameraPermissionNeeded")
        );
        return;
      }
      if (preparedMedia.notice) {
        antdMessage.warning(preparedMedia.notice);
      }

      const callId = uuidv4();
      const requestId = uuidv4();
      const deviceId = await transport.getDeviceId();
      if (!deviceId) {
        antdMessage.error(i18n.t("callActions.deviceIdUnavailableStart"));
        return;
      }

      const payload: CallInviteRequestMessage = {
        messageClassify: "call.invite.request",
        call_id: callId,
        conversation_id: conversation.server_conversation_id,
        call_scope: callScope,
        media_type: preparedMedia.effectiveMediaType,
        sender_user_id: loginUser.userId,
        sender_device_id: deviceId,
        request_id: requestId,
        timestamp: new Date().toISOString(),
        target_user_ids: targetUserIds
      };

      const optimisticSession: CallSession = {
        call_id: callId,
        conversation_id: conversation.server_conversation_id,
        call_scope: callScope,
        media_type: preparedMedia.effectiveMediaType,
        initiator_user_id: loginUser.userId,
        status: CALL_STATUS_RINGING,
        active_device_count: 1,
        participant_count: targetUserIds.length + 1,
        started_at: new Date().toISOString(),
        answered_at: null,
        ended_at: null,
        end_reason: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      state.setCallSession({
        call_id: callId,
        conversation_id: conversation.server_conversation_id,
        call_scope: callScope,
        media_type: preparedMedia.effectiveMediaType,
        requested_media_type: mediaType,
        direction: "outgoing",
        phase: "ringing",
        conversation_label:
          conversation.display_name ||
          conversation.name ||
          i18n.t("ui.callOverlay.call"),
        session: optimisticSession,
        participants: [],
        local_audio_enabled: preparedMedia.localAudioEnabled,
        local_video_enabled: preparedMedia.localVideoEnabled,
        local_participation_mode: preparedMedia.localParticipationMode
      });
      void callSoundPlayer.playLoop("outgoing");

      try {
        await transport.sendCallMessage(payload);
      } catch (error) {
        callSoundPlayer.stopLoop();
        state.dismissCallSessionNow();
        antdMessage.error(
          error instanceof Error
            ? error.message
            : i18n.t("callActions.startFailed")
        );
      }
    },
    [direct, loginUser, media, state, transport, wsUiStateRef]
  );

  const handleStartAudioCall = useCallback(
    async (
      conversation: Conversation,
      options?: { targetUserIds?: number[] }
    ) => {
      await handleStartCall(conversation, CALL_MEDIA_TYPE_AUDIO, options);
    },
    [handleStartCall]
  );

  const handleStartVideoCall = useCallback(
    async (
      conversation: Conversation,
      options?: { targetUserIds?: number[] }
    ) => {
      await handleStartCall(conversation, CALL_MEDIA_TYPE_VIDEO, options);
    },
    [handleStartCall]
  );

  const handleAcceptCall = useCallback(async () => {
    const current = state.getSession();
    if (!loginUser || !current) {
      return;
    }

    let preparedMedia: PreparedLocalCallMedia;
    try {
      preparedMedia = await media.prepareLocalMedia({
        requestedMediaType: current.requested_media_type,
        context: "accept"
      });
    } catch (error) {
      antdMessage.error(
        error instanceof Error
          ? error.message
          : i18n.t("callActions.micCameraPermissionNeeded")
      );
      return;
    }
    if (preparedMedia.notice) {
      antdMessage.warning(preparedMedia.notice);
    }

    const deviceId = await transport.getDeviceId();
    if (!deviceId) {
      antdMessage.error(i18n.t("callActions.deviceIdUnavailableAccept"));
      return;
    }
    void window.electronAPI?.clearIncomingCall?.(current.call_id);
    callSoundPlayer.stopLoop();

    const payload: CallAcceptRequestMessage = {
      messageClassify: "call.accept.request",
      call_id: current.call_id,
      conversation_id: current.conversation_id,
      call_scope: current.call_scope,
      media_type: preparedMedia.effectiveMediaType,
      local_audio_enabled: preparedMedia.localAudioEnabled,
      local_video_enabled: preparedMedia.localVideoEnabled,
      sender_user_id: loginUser.userId,
      sender_device_id: deviceId,
      request_id: uuidv4(),
      timestamp: new Date().toISOString()
    };
    await transport.sendCallMessage(payload);
    state.setCallSession(prev =>
      prev
        ? {
            ...prev,
            direction: "incoming",
            media_type:
              prev.call_scope === CALL_SCOPE_GROUP
                ? prev.media_type
                : preparedMedia.effectiveMediaType,
            phase: "ongoing",
            session: {
              ...prev.session,
              media_type:
                prev.call_scope === CALL_SCOPE_GROUP
                  ? prev.session.media_type
                  : preparedMedia.effectiveMediaType
            },
            local_audio_enabled: preparedMedia.localAudioEnabled,
            local_video_enabled: preparedMedia.localVideoEnabled,
            local_participation_mode: preparedMedia.localParticipationMode
          }
        : prev
    );
  }, [loginUser, media, state, transport]);

  const handleRejectCall = useCallback(async () => {
    const current = state.getSession();
    if (!loginUser || !current) {
      return;
    }

    state.clearCallDismissTimer();
    void window.electronAPI?.clearIncomingCall?.(current.call_id);
    callSoundPlayer.stopLoop();
    void callSoundPlayer.playOnce("rejected");
    const deviceId = await transport.getDeviceId();
    if (!deviceId) {
      return;
    }

    const payload: CallRejectRequestMessage = {
      messageClassify: "call.reject.request",
      call_id: current.call_id,
      conversation_id: current.conversation_id,
      call_scope: current.call_scope,
      media_type: current.media_type,
      sender_user_id: loginUser.userId,
      sender_device_id: deviceId,
      request_id: uuidv4(),
      timestamp: new Date().toISOString()
    };
    await transport.sendCallMessage(payload);
    state.dismissCallSessionNow();
  }, [loginUser, state, transport]);

  const handleEndCall = useCallback(async () => {
    const current = state.getSession();
    if (!loginUser || !current) {
      return;
    }

    state.clearCallDismissTimer();
    void window.electronAPI?.clearIncomingCall?.(current.call_id);
    callSoundPlayer.stopLoop();
    void callSoundPlayer.playOnce("hangup");
    const deviceId = await transport.getDeviceId();
    if (deviceId) {
      const payload: CallEndRequestMessage = {
        messageClassify: "call.end.request",
        call_id: current.call_id,
        conversation_id: current.conversation_id,
        call_scope: current.call_scope,
        media_type: current.media_type,
        sender_user_id: loginUser.userId,
        sender_device_id: deviceId,
        request_id: uuidv4(),
        timestamp: new Date().toISOString()
      };
      await transport.sendCallMessage(payload);
    }

    media.replaceLocalStream(null);
    direct.closePeerConnection();
    void group.disconnect();
    state.setCallSession(prev =>
      prev
        ? {
            ...prev,
            phase: "ended"
          }
        : prev
    );
  }, [direct, group, loginUser, media, state, transport]);

  // 主动开关麦克风/摄像头（方案 A：仅翻转已有轨道的 enabled，不中途采集新
  // 轨道，因此无需重新协商）。本地 enabled 状态更新后，ongoing 阶段的
  // broadcastLocalCallMediaState effect 会自动把媒体状态广播给对端；群通话再
  // 通过 syncGroupRoomLocalTracks 把已发布轨道集合与本地采集状态重新对齐。
  const handleToggleLocalMedia = useCallback(
    async (kind: "audio" | "video") => {
      const current = state.getSession();
      if (!current || current.phase !== "ongoing") {
        return;
      }

      const stream = media.getLocalStream();
      const track =
        kind === "audio"
          ? stream?.getAudioTracks()[0]
          : stream?.getVideoTracks()[0];
      if (!track || track.readyState !== "live") {
        // 方案 A 不支持中途采集新轨道（例如语音通话临时开启摄像头）。
        antdMessage.info(
          kind === "audio"
            ? i18n.t("callActions.noMicTrack")
            : i18n.t("callActions.cannotEnableCameraMidCall")
        );
        return;
      }

      const nextEnabled = !track.enabled;
      track.enabled = nextEnabled;

      const localAudioEnabled = Boolean(
        stream
          ?.getAudioTracks()
          .some(item => item.readyState === "live" && item.enabled)
      );
      const localVideoEnabled = Boolean(
        stream
          ?.getVideoTracks()
          .some(item => item.readyState === "live" && item.enabled)
      );

      state.setCallSession(prev =>
        prev
          ? {
              ...prev,
              local_audio_enabled: localAudioEnabled,
              local_video_enabled: localVideoEnabled,
              local_participation_mode: resolveCallParticipationMode(
                localAudioEnabled,
                localVideoEnabled
              )
            }
          : prev
      );

      if (current.call_scope === CALL_SCOPE_GROUP) {
        await group.syncLocalTracksToRoom();
      }
    },
    [group, media, state]
  );

  const dismissCallSession = useCallback(() => {
    state.dismissCallSessionNow();
  }, [state]);

  return {
    callSession: state.callSession,
    localCallStream: media.localCallStream,
    remoteCallStream: direct.remoteCallStream,
    groupParticipantMedia: group.groupParticipantMedia,
    groupLocalSpeaking: group.localIsSpeaking,
    handleCallWsMessage: wsBridge.handleCallWsMessage,
    handleStartAudioCall,
    handleStartVideoCall,
    handleAcceptCall,
    handleRejectCall,
    handleEndCall,
    handleToggleLocalMedia,
    dismissCallSession
  };
}
