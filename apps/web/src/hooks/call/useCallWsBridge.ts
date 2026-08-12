import { i18n } from "../../i18n";
import { message as antdMessage } from "antd";
import log from "@/utils/log";
import { useCallback, useEffect, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import {
  CALL_MEDIA_TYPE_AUDIO,
  CALL_MEDIA_TYPE_VIDEO,
  CALL_SCOPE_GROUP,
  CALL_STATUS_ONGOING,
  getCallPhaseFromMessage,
  shouldDismissCallSessionAfterMessage,
  shouldLocalUserCreateCallOffer
} from "@mushroom/shared";
import type {
  AnswerMessage,
  AnyWsMessage,
  CallEndRequestMessage,
  IceMessage,
  OfferMessage
} from "@mushroom/shared";
import type { CallUiSession } from "../../types/chat";
import type { LoginUser } from "../../types/user";
import type { CallSignalTransport } from "./callSignalTransport";
import { callSoundPlayer } from "../../utils/callSoundPlayer";
import { sameUserId } from "../useChatHelpers";
import { bumpIceCounter, drainIceCounter } from "./callIceDiagnostics";
import { playTerminalCallSound } from "./callSounds";
import {
  getRemoteCallParticipant,
  type CallSessionLifecycleMessage
} from "./callSession";

const callLog = log.scope("call");

type SendCallSignal = (
  message:
    | Omit<OfferMessage, "sender_user_id" | "sender_device_id" | "timestamp">
    | Omit<AnswerMessage, "sender_user_id" | "sender_device_id" | "timestamp">
    | Omit<IceMessage, "sender_user_id" | "sender_device_id" | "timestamp">
) => Promise<void>;

export type CallWsBridgeHandlers = {
  getSession: () => CallUiSession | null;
  setSession: React.Dispatch<React.SetStateAction<CallUiSession | null>>;
  upsertSession: (
    direction: "incoming" | "outgoing",
    payload: CallSessionLifecycleMessage
  ) => void;
  dismissNow: () => void;
  resolveConversationLabel: (conversationId: string) => string;
  createOfferForCall: (
    session: CallUiSession,
    remoteDeviceId?: string
  ) => Promise<void>;
  applySignalDescription: (
    signal: OfferMessage | AnswerMessage,
    session: CallUiSession
  ) => Promise<void>;
  applyIceCandidate: (signal: IceMessage) => Promise<void>;
  hasActivePeerConnection: () => boolean;
  hasActiveLiveKitRoom: () => boolean;
};

type UseCallWsBridgeOptions = {
  loginUser: LoginUser | null;
  transport: CallSignalTransport;
};

export type CallWsBridgeApi = {
  handleCallWsMessage: (payload: AnyWsMessage) => boolean;
  sendCallSignal: SendCallSignal;
  broadcastLocalCallMediaState: (session: CallUiSession) => Promise<void>;
  getCurrentDeviceId: () => string | null;
  attachHandlers: (handlers: CallWsBridgeHandlers) => void;
};

/**
 * WS 桥：
 *  - 出向：sendCallSignal + broadcastLocalCallMediaState
 *  - 入向：handleCallWsMessage（解析 call.* 消息并分发到 transport/state）
 *
 * 由于 dispatcher 需要 transport 层的能力，但本 hook 需要先暴露 sendCallSignal
 * 给 transport 创建，因此采用 late-binding：先创建空壳，再由顶层 attachHandlers
 * 注入下游能力。所有调用都通过 handlersRef 取最新值，避免 stale closure。
 */
export function useCallWsBridge({
  loginUser,
  transport
}: UseCallWsBridgeOptions): CallWsBridgeApi {
  const currentDeviceIdRef = useRef<string | null>(null);
  const lastBroadcastSignatureRef = useRef<string | null>(null);
  const handlersRef = useRef<CallWsBridgeHandlers | null>(null);

  const attachHandlers = useCallback((handlers: CallWsBridgeHandlers) => {
    handlersRef.current = handlers;
  }, []);

  const getCurrentDeviceId = useCallback(() => currentDeviceIdRef.current, []);

  const sendCallSignal: SendCallSignal = useCallback(
    async message => {
      if (!loginUser) {
        return;
      }

      const deviceId = await transport.getDeviceId();
      if (!deviceId) {
        throw new Error(i18n.t("callActions.deviceIdUnavailable"));
      }
      currentDeviceIdRef.current = deviceId;

      await transport.sendCallMessage({
        ...message,
        sender_user_id: loginUser.userId,
        sender_device_id: deviceId,
        timestamp: new Date().toISOString()
      });
    },
    [loginUser, transport]
  );

  const broadcastLocalCallMediaState = useCallback(
    async (session: CallUiSession) => {
      if (!loginUser || session.phase !== "ongoing") {
        return;
      }

      const participationMode = session.local_participation_mode;
      if (!participationMode) {
        return;
      }

      const signature = [
        session.call_id,
        session.local_audio_enabled ? "1" : "0",
        session.local_video_enabled ? "1" : "0",
        participationMode
      ].join(":");
      if (lastBroadcastSignatureRef.current === signature) {
        return;
      }

      const deviceId = await transport.getDeviceId();
      if (!deviceId) {
        return;
      }
      currentDeviceIdRef.current = deviceId;

      await transport.sendCallMessage({
        messageClassify: "call.media-state.request",
        call_id: session.call_id,
        conversation_id: session.conversation_id,
        call_scope: session.call_scope,
        media_type: session.media_type,
        sender_user_id: loginUser.userId,
        sender_device_id: deviceId,
        request_id: uuidv4(),
        timestamp: new Date().toISOString(),
        audio_enabled: Boolean(session.local_audio_enabled),
        video_enabled: Boolean(session.local_video_enabled),
        participation_mode: participationMode
      });
      lastBroadcastSignatureRef.current = signature;
    },
    [loginUser, transport]
  );

  const getRemoteParticipant = useCallback(
    (session: CallUiSession | null) => {
      return getRemoteCallParticipant({
        session,
        loginUserId: loginUser?.userId
      });
    },
    [loginUser?.userId]
  );

  const handleCallWsMessage = useCallback(
    (payload: AnyWsMessage): boolean => {
      if (!loginUser) {
        return false;
      }
      const h = handlersRef.current;
      if (!h) {
        return false;
      }

      switch (payload.messageClassify) {
        case "call.invited": {
          const isTargetUser = payload.participants.some(participant =>
            sameUserId(participant.user_id, loginUser.userId)
          );
          if (
            isTargetUser &&
            !sameUserId(payload.sender_user_id, loginUser.userId)
          ) {
            callLog.info("invited", {
              callId: payload.call_id,
              mediaType: payload.media_type,
              scope: payload.call_scope,
              senderUserId: payload.sender_user_id,
              participantCount: payload.participants.length
            });
            h.upsertSession("incoming", payload);
            void callSoundPlayer.playLoop("incoming");
            const mediaLabel =
              payload.media_type === CALL_MEDIA_TYPE_VIDEO
                ? i18n.t("notifications.videoCallIncoming")
                : i18n.t("notifications.voiceCallIncoming");
            void window.electronAPI?.notifyIncomingCall?.({
              callId: payload.call_id,
              conversationId: payload.conversation_id,
              title: mediaLabel,
              body: h.resolveConversationLabel(payload.conversation_id),
              mediaType: payload.media_type,
              timeoutSeconds: payload.timeout_seconds
            });
          }
          return true;
        }
        case "call.accepted":
          void window.electronAPI?.clearIncomingCall?.(payload.call_id);
          if (h.getSession()?.call_id === payload.call_id) {
            const currentSession = h.getSession();
            if (!currentSession) {
              return true;
            }
            const shouldPlayConnectedTone = currentSession.phase !== "ongoing";

            if (currentSession.phase !== "ongoing") {
              callLog.info("phase", {
                callId: payload.call_id,
                from: currentSession.phase,
                to: "ongoing",
                via: "call.accepted"
              });
            }

            const nextDirection = currentSession.direction ?? "outgoing";
            if (
              nextDirection === "outgoing" &&
              currentSession.requested_media_type === CALL_MEDIA_TYPE_VIDEO &&
              payload.session.media_type === CALL_MEDIA_TYPE_AUDIO
            ) {
              antdMessage.warning(i18n.t("callActions.switchedToVoice"));
            }
            const nextSession: CallUiSession = {
              ...currentSession,
              media_type: payload.session.media_type,
              phase: "ongoing",
              session: payload.session,
              participants: [
                ...currentSession.participants.filter(
                  participant =>
                    participant.device_id !== payload.participant.device_id
                ),
                payload.participant
              ]
            };
            h.upsertSession(nextDirection, payload);
            callSoundPlayer.stopLoop();
            if (shouldPlayConnectedTone) {
              void callSoundPlayer.playOnce("connected");
            }
            if (
              shouldLocalUserCreateCallOffer({
                callScope: payload.call_scope,
                initiatorUserId: payload.session.initiator_user_id,
                localUserId: loginUser.userId
              }) &&
              nextSession
            ) {
              void h.createOfferForCall(
                nextSession,
                payload.participant.device_id
              );
            }
          }
          return true;
        case "call.state-sync":
          if (h.getSession()?.call_id === payload.call_id) {
            const currentSession = h.getSession();
            if (!currentSession) {
              return true;
            }

            callLog.info("state-sync", {
              callId: payload.call_id,
              currentPhase: currentSession.phase,
              nextStatus: payload.session.status,
              participantCount: payload.participants.length
            });

            const nextDirection = currentSession.direction ?? "outgoing";
            const nextSession: CallUiSession = {
              ...currentSession,
              media_type: payload.session.media_type,
              phase: getCallPhaseFromMessage(payload),
              session: payload.session,
              participants: payload.participants
            };
            h.upsertSession(nextDirection, payload);
            if (
              nextSession.phase === "ongoing" &&
              currentSession.phase !== "ongoing"
            ) {
              callSoundPlayer.stopLoop();
              void callSoundPlayer.playOnce("connected");
            }
            if (nextSession.phase === "ended") {
              const shouldPlayHangupTone =
                currentSession.phase !== nextSession.phase;
              callLog.info(
                "Received terminal call.state-sync, dismissing immediately",
                {
                  callId: payload.call_id,
                  nextPhase: nextSession.phase,
                  status: payload.session.status
                }
              );
              void window.electronAPI?.clearIncomingCall?.(payload.call_id);
              callSoundPlayer.stopLoop();
              if (shouldPlayHangupTone) {
                void callSoundPlayer.playOnce("hangup");
              }
              h.dismissNow();
            }
            if (
              shouldLocalUserCreateCallOffer({
                callScope: payload.call_scope,
                initiatorUserId: payload.session.initiator_user_id,
                localUserId: loginUser.userId
              }) &&
              payload.session.status === CALL_STATUS_ONGOING &&
              !h.hasActivePeerConnection()
            ) {
              const remoteParticipant = getRemoteParticipant(nextSession);
              if (remoteParticipant) {
                void h.createOfferForCall(
                  nextSession,
                  remoteParticipant.device_id
                );
              }
            }
          }
          return true;
        case "call.media-state":
          if (h.getSession()?.call_id === payload.call_id) {
            h.setSession(current =>
              current
                ? {
                    ...current,
                    participants: current.participants.map(participant =>
                      sameUserId(participant.user_id, payload.sender_user_id) &&
                      participant.device_id === payload.sender_device_id
                        ? {
                            ...participant,
                            audio_enabled: payload.audio_enabled,
                            video_enabled: payload.video_enabled,
                            participation_mode: payload.participation_mode
                          }
                        : participant
                    )
                  }
                : current
            );
          }
          return true;
        case "call.error": {
          callLog.warn("call.error", {
            callId: payload.call_id,
            message: payload.message
          });
          if (payload.call_id) {
            void window.electronAPI?.clearIncomingCall?.(payload.call_id);
          }
          callSoundPlayer.stopLoop();
          void callSoundPlayer.playOnce("hangup");
          antdMessage.error(payload.message);
          const currentSession = h.getSession();
          if (
            currentSession &&
            currentSession.call_id === payload.call_id &&
            (currentSession.phase === "ringing" ||
              (currentSession.call_scope === CALL_SCOPE_GROUP &&
                !h.hasActiveLiveKitRoom()))
          ) {
            h.dismissNow();
          }
          if (payload.call_id) {
            drainIceCounter(payload.call_id);
          }
          return true;
        }
        case "call.busy":
        case "call.rejected":
        case "call.timeout":
        case "call.ended":
          void window.electronAPI?.clearIncomingCall?.(payload.call_id);
          if (h.getSession()?.call_id === payload.call_id) {
            const currentSession = h.getSession();
            const shouldPlayTerminalTone =
              currentSession?.phase !== getCallPhaseFromMessage(payload);
            callLog.info("terminal", {
              callId: payload.call_id,
              via: payload.messageClassify,
              from: currentSession?.phase ?? null,
              status: payload.session.status
            });

            // If the local user was in the ongoing phase (already accepted /
            // joined), proactively notify the server so it transitions the
            // participant from JOINED to LEFT.  Without this the server keeps
            // the participant as JOINED and future calls are rejected as busy.
            if (currentSession?.phase === "ongoing" && loginUser) {
              void (async () => {
                try {
                  const deviceId = await transport.getDeviceId();
                  if (deviceId) {
                    const endPayload: CallEndRequestMessage = {
                      messageClassify: "call.end.request",
                      call_id: payload.call_id,
                      conversation_id: payload.conversation_id,
                      call_scope: payload.call_scope,
                      media_type: payload.media_type,
                      sender_user_id: loginUser.userId,
                      sender_device_id: deviceId,
                      request_id: uuidv4(),
                      timestamp: new Date().toISOString()
                    };
                    await transport.sendCallMessage(endPayload);
                  }
                } catch (err) {
                  callLog.warn("Failed to send call.end.request on terminal", {
                    callId: payload.call_id,
                    err: err instanceof Error ? err.message : String(err)
                  });
                }
              })();
            }

            h.upsertSession(currentSession?.direction ?? "outgoing", payload);
            callSoundPlayer.stopLoop();
            if (shouldPlayTerminalTone) {
              playTerminalCallSound(payload.messageClassify);
            }
            if (shouldDismissCallSessionAfterMessage(payload)) {
              callLog.info("terminal dismiss", {
                callId: payload.call_id,
                via: payload.messageClassify
              });
              h.dismissNow();
            }
            drainIceCounter(payload.call_id);
          }
          return true;
        case "offer":
        case "answer":
          if (h.getSession()?.call_id === payload.call_id) {
            callLog.info("sdp", {
              callId: payload.call_id,
              type: payload.messageClassify
            });
            const currentSession = h.getSession();
            if (currentSession) {
              void h
                .applySignalDescription(payload, currentSession)
                .catch(error => {
                  callLog.warn("handleRemoteDescription failed", {
                    callId: payload.call_id,
                    type: payload.messageClassify,
                    err: error instanceof Error ? error.message : String(error)
                  });
                });
            }
          }
          return true;
        case "ice":
          if (h.getSession()?.call_id === payload.call_id) {
            void h
              .applyIceCandidate(payload)
              .then(() => bumpIceCounter(payload.call_id, true))
              .catch(error => {
                bumpIceCounter(payload.call_id, false, error);
              });
          }
          return true;
        default:
          return false;
      }
    },
    [getRemoteParticipant, loginUser, transport]
  );

  // 仅做依赖项稳定化：handlersRef 是 mutable，无需 effect。
  useEffect(() => {
    return () => {
      handlersRef.current = null;
    };
  }, []);

  return {
    handleCallWsMessage,
    sendCallSignal,
    broadcastLocalCallMediaState,
    getCurrentDeviceId,
    attachHandlers
  };
}
