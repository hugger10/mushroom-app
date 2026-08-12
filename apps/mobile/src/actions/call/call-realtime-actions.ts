import { Platform } from "react-native";
import {
  CALL_PARTICIPANT_ROLE_INITIATOR,
  shouldAutoDismissCallSessionForPhase,
  shouldDismissCallSessionAfterMessage,
  type CallStateSyncMessage,
  type ServerWsMessage,
  type CallEndRequestMessage
} from "@mushroom/shared";
import {
  mobileAppController,
  mobileServerApi,
  mobileDeviceId,
  mobileRealtimeClient
} from "../../services/app-runtime";
import {
  clearIncomingCallNotification,
  displayIncomingCallNotification
} from "../../platform/notification-center";
import { mobileCallSoundPlayer } from "../../platform/call-sound-player";
import {
  endSystemCall,
  markSystemCallActive,
  reportIncomingSystemCall
} from "../../platform/system-call";
import { sameUserId, createRequestId } from "../../utils/app-ui";
import log from "../../utils/log";
import type { MobileAppState } from "../../app/controller/useMobileAppState";
import type { createCallMediaActions } from "./call-media-actions";
import type { createCallSessionActions } from "./call-session-actions";
import { i18n } from "../../i18n";

const callLog = log.scope("call");

// Aggregate ICE candidate counts per call_id instead of logging each
// candidate (one call can produce dozens of candidates on a flaky link).
const iceCounters = new Map<string, { added: number; rejected: number }>();
function bumpIceCounter(callId: string, ok: boolean) {
  let entry = iceCounters.get(callId);
  if (!entry) {
    entry = { added: 0, rejected: 0 };
    iceCounters.set(callId, entry);
  }
  if (ok) entry.added += 1;
  else entry.rejected += 1;
}
function drainIceCounter(callId: string) {
  const entry = iceCounters.get(callId);
  if (!entry) return;
  iceCounters.delete(callId);
  callLog.info("ice summary", { callId, ...entry });
}

type SessionActions = ReturnType<typeof createCallSessionActions>;
type MediaActions = ReturnType<typeof createCallMediaActions>;

export function createCallRealtimeActions(params: {
  state: MobileAppState;
  sessionActions: SessionActions;
  mediaActions: MediaActions;
}) {
  const { state, sessionActions, mediaActions } = params;

  async function handleRealtimeSocketMessage(message: ServerWsMessage) {
    const currentUserId = state.snapshot?.auth.user?.userId;
    if (!currentUserId) {
      return;
    }

    switch (message.messageClassify) {
      case "call.invited": {
        const isTargetUser = message.participants.some(participant =>
          sameUserId(participant.user_id, currentUserId)
        );
        if (
          isTargetUser &&
          !sameUserId(message.sender_user_id, currentUserId)
        ) {
          callLog.info("invited", {
            callId: message.call_id,
            mediaType: message.media_type,
            scope: message.call_scope
          });
          sessionActions.upsertCallSession("incoming", message);
          void reportIncomingSystemCall({
            type: "call.invite",
            title: i18n.t("notifications.incomingCall"),
            body: i18n.t("notifications.incomingCallBody"),
            callId: message.call_id,
            conversationId: message.conversation_id,
            mediaType: message.media_type,
            callScope: message.call_scope,
            senderUserId: message.sender_user_id,
            senderDeviceId: message.sender_device_id,
            timeoutSeconds: message.timeout_seconds
          });
          if (Platform.OS === "android") {
            void displayIncomingCallNotification({
              type: "call.invite",
              title:
                message.media_type === 2
                  ? i18n.t("notifications.videoCallIncoming")
                  : i18n.t("notifications.voiceCallIncoming"),
              body:
                state.callSessionRef.current?.conversation_label ||
                i18n.t("notifications.incomingCallBody"),
              callId: message.call_id,
              conversationId: message.conversation_id,
              conversationName:
                state.callSessionRef.current?.conversation_label,
              mediaType: message.media_type,
              callScope: message.call_scope,
              senderUserId: message.sender_user_id,
              senderDeviceId: message.sender_device_id,
              timeoutSeconds: message.timeout_seconds
            });
          }
          state.setStatus("");
        }
        break;
      }
      case "call.ringing": {
        if (state.callSessionRef.current?.call_id === message.call_id) {
          callLog.info("ringing", { callId: message.call_id });
          sessionActions.upsertCallSession(
            state.callSessionRef.current.direction ?? "outgoing",
            message
          );
          state.setStatus("");
        }
        break;
      }
      case "call.accepted":
      case "call.state-sync": {
        if (state.callSessionRef.current?.call_id === message.call_id) {
          const currentPhase = state.callSessionRef.current.phase;
          const nextDirection =
            state.callSessionRef.current.direction ?? "outgoing";
          sessionActions.upsertCallSession(nextDirection, message);
          const nextSession = state.callSessionRef.current;
          if (currentPhase !== nextSession?.phase) {
            callLog.info("phase", {
              callId: message.call_id,
              from: currentPhase,
              to: nextSession?.phase,
              via: message.messageClassify
            });
          }
          state.setStatus("");
          if (nextSession && nextSession.phase !== "ringing") {
            void clearIncomingCallNotification(message.call_id);
          }
          if (nextSession?.phase === "ongoing" && currentPhase !== "ongoing") {
            await mobileCallSoundPlayer.stopAll();
            void mobileCallSoundPlayer.playOnce("connected");
          }
          if (nextSession?.phase === "ongoing") {
            void markSystemCallActive(message.call_id);
          }
          if (nextSession) {
            void mediaActions
              .maybeCreateDirectCallOffer(nextSession)
              .catch(error => {
                callLog.warn("createDirectCallOffer failed", {
                  callId: message.call_id,
                  err: error instanceof Error ? error.message : String(error)
                });
                state.setError(
                  error instanceof Error ? error.message : String(error)
                );
              });
            // Group calls join the LiveKit SFU room here instead of creating a
            // P2P offer. No-op for direct calls.
            void mediaActions
              .maybeJoinGroupCallRoom(nextSession)
              .catch(error => {
                callLog.warn("joinGroupCallRoom failed", {
                  callId: message.call_id,
                  err: error instanceof Error ? error.message : String(error)
                });
                state.setError(
                  error instanceof Error
                    ? error.message
                    : i18n.t("callActions.joinRoomFailed")
                );
              });
          }
        }
        break;
      }
      case "call.media-state": {
        state.setCallSession(current =>
          current && current.call_id === message.call_id
            ? (() => {
                const nextSession = {
                  ...current,
                  participants: current.participants.map(participant =>
                    sameUserId(participant.user_id, message.sender_user_id) &&
                    participant.device_id === message.sender_device_id
                      ? {
                          ...participant,
                          audio_enabled: message.audio_enabled,
                          video_enabled: message.video_enabled,
                          participation_mode: message.participation_mode
                        }
                      : participant
                  )
                };
                state.callSessionRef.current = nextSession;
                return nextSession;
              })()
            : current
        );
        break;
      }
      case "call.error": {
        callLog.warn("call.error", {
          callId: message.call_id,
          message: message.message
        });
        state.setError(message.message);
        state.setStatus(i18n.t("callActions.operationFailed"));
        if (state.callSessionRef.current?.call_id === message.call_id) {
          await mobileCallSoundPlayer.stopAll();
          void mobileCallSoundPlayer.playOnce("hangup");
          void clearIncomingCallNotification(message.call_id);
          mediaActions.releaseCallMedia();
          state.dismissCallSessionNow();
          void endSystemCall(message.call_id || "");
          drainIceCounter(message.call_id || "");
        }
        break;
      }
      case "offer":
      case "answer": {
        if (state.callSessionRef.current?.call_id === message.call_id) {
          callLog.info("sdp", {
            callId: message.call_id,
            type: message.messageClassify
          });
          void mediaActions.handleRemoteDescription(message).catch(error => {
            callLog.warn("handleRemoteDescription failed", {
              callId: message.call_id,
              type: message.messageClassify,
              err: error instanceof Error ? error.message : String(error)
            });
            state.setError(
              error instanceof Error ? error.message : String(error)
            );
          });
        }
        break;
      }
      case "ice": {
        if (state.callSessionRef.current?.call_id === message.call_id) {
          // Aggregate per-call; one log line per phase transition / end
          // instead of per-candidate noise.
          void mediaActions
            .handleIceCandidate(message)
            .then(() => bumpIceCounter(message.call_id, true))
            .catch(error => {
              bumpIceCounter(message.call_id, false);
              state.setError(
                error instanceof Error ? error.message : String(error)
              );
            });
        }
        break;
      }
      case "call.busy":
      case "call.rejected":
      case "call.timeout":
      case "call.ended": {
        if (state.callSessionRef.current?.call_id === message.call_id) {
          const currentPhase = state.callSessionRef.current.phase;
          callLog.info("terminal", {
            callId: message.call_id,
            via: message.messageClassify,
            from: currentPhase
          });

          // If the local user was in the ongoing phase (already accepted /
          // joined), proactively notify the server so it transitions the
          // participant from JOINED to LEFT.  Without this the server keeps
          // the participant as JOINED and future calls are rejected as busy.
          const loginUser = state.snapshot?.auth.user;
          if (currentPhase === "ongoing" && loginUser) {
            void (async () => {
              try {
                const endPayload: CallEndRequestMessage = {
                  messageClassify: "call.end.request",
                  call_id: message.call_id,
                  conversation_id: message.conversation_id,
                  call_scope: message.call_scope,
                  media_type: message.media_type,
                  sender_user_id: loginUser.userId,
                  sender_device_id: mobileDeviceId,
                  request_id: createRequestId(),
                  timestamp: new Date().toISOString()
                };
                await mobileRealtimeClient.sendMessage(endPayload);
              } catch (err) {
                callLog.warn("Failed to send call.end.request on terminal", {
                  callId: message.call_id,
                  err: err instanceof Error ? err.message : String(err)
                });
              }
            })();
          }

          drainIceCounter(message.call_id);
          void clearIncomingCallNotification(message.call_id);
          sessionActions.upsertCallSession(
            state.callSessionRef.current.direction ?? "outgoing",
            message
          );
          await mobileCallSoundPlayer.stopAll();
          if (currentPhase !== state.callSessionRef.current?.phase) {
            if (message.messageClassify === "call.busy") {
              void mobileCallSoundPlayer.playOnce("busy");
            } else if (message.messageClassify === "call.rejected") {
              void mobileCallSoundPlayer.playOnce("rejected");
            } else if (message.messageClassify === "call.timeout") {
              void mobileCallSoundPlayer.playOnce("timeout");
            } else {
              void mobileCallSoundPlayer.playOnce("hangup");
            }
          }
          mediaActions.releaseCallMedia();
          state.setStatus("");
          void endSystemCall(message.call_id);
          void mobileAppController.syncNow();
          if (shouldDismissCallSessionAfterMessage(message)) {
            state.clearCallDismissTimer();
            state.callDismissTimerRef.current = setTimeout(
              () => {
                state.dismissCallSessionNow();
              },
              shouldAutoDismissCallSessionForPhase("ended") ? 1200 : 0
            );
          }
        }
        break;
      }
      default:
        break;
    }
  }

  /**
   * Rebuild `callSession` from the authoritative server state for a given
   * `call_id`. Needed for offline answer/decline: while the app is
   * backgrounded/killed the WebSocket is disconnected, so the `call.invited`
   * frame never arrives and `callSessionRef.current` is null. The system call
   * UI (CallKit / VoIP on iOS, ConnectionService on Android) still rings via
   * push, and once the user acts we must reconstruct the session before we can
   * accept/reject. Fetches `getCallState` and feeds it through the normal
   * `call.state-sync` path (same logic as the notification cold-open in
   * `useMobileAppEffects.openPayloadEvent`).
   *
   * Returns the rebuilt session (or the already-present one) or null when the
   * call no longer exists server-side (already ended / stale push).
   */
  async function rebuildCallSessionFromServer(callId: string) {
    if (state.callSessionRef.current?.call_id === callId) {
      return state.callSessionRef.current;
    }

    const currentUserId = state.snapshot?.auth.user?.userId;

    try {
      const result = await mobileServerApi.getCallState({ callId });
      const initiator =
        result.data.participants.find(
          participant =>
            participant.participant_role === CALL_PARTICIPANT_ROLE_INITIATOR
        ) ?? result.data.participants[0];
      const syncMessage: CallStateSyncMessage = {
        messageClassify: "call.state-sync",
        call_id: result.data.session.call_id,
        conversation_id: result.data.session.conversation_id,
        call_scope: result.data.session.call_scope,
        media_type: result.data.session.media_type,
        sender_user_id:
          initiator?.user_id ?? result.data.session.initiator_user_id,
        sender_device_id: initiator?.device_id ?? "push",
        timestamp: new Date().toISOString(),
        session: result.data.session,
        participants: result.data.participants
      };
      // The `call.state-sync` realtime branch only *updates* an existing
      // session; with no in-memory session (offline/killed answer) it would be
      // a no-op. Create the session directly via upsertCallSession so the
      // CallOverlay can render and accept/reject can proceed. Direction is
      // "outgoing" only if we initiated; otherwise this is an inbound call.
      const direction =
        currentUserId !== undefined &&
        sameUserId(result.data.session.initiator_user_id, currentUserId)
          ? "outgoing"
          : "incoming";
      return sessionActions.upsertCallSession(direction, syncMessage);
    } catch {
      // Stale call payload that has already ended server-side.
      return null;
    }
  }

  /**
   * Accept a call identified only by `call_id`. Used by the system-call
   * (CallKeep) "answer" action and the cold-start pending-action replay, where
   * the in-memory session may not exist yet. Rebuilds the session first when
   * necessary, then delegates to the normal accept flow.
   */
  async function acceptCallById(callId: string) {
    const session = await rebuildCallSessionFromServer(callId);
    if (!session || session.call_id !== callId) {
      return;
    }
    // `handleAcceptCall` marks the system call active optimistically, so a
    // cold-start/offline answer activates CallKit audio without waiting on the
    // accept → `call.accepted` → WebRTC `ongoing` round-trip.
    await sessionActions.handleAcceptCall();
  }

  /**
   * Reject (if still ringing/incoming) or end a call identified only by
   * `call_id`. Used by the system-call "end" action and cold-start replay.
   */
  async function rejectOrEndCallById(callId: string) {
    const session = await rebuildCallSessionFromServer(callId);
    if (!session || session.call_id !== callId) {
      return;
    }
    if (session.direction === "incoming" && session.phase === "ringing") {
      await sessionActions.handleRejectCall();
    } else {
      await sessionActions.handleEndCall();
    }
  }

  return {
    handleRealtimeSocketMessage,
    rebuildCallSessionFromServer,
    acceptCallById,
    rejectOrEndCallById
  };
}
