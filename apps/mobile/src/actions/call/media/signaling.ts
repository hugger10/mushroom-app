import {
  CALL_SCOPE_DIRECT,
  shouldLocalUserCreateCallOffer,
  type AnswerMessage,
  type IceMessage,
  type OfferMessage
} from "@mushroom/shared";
import {
  RTCIceCandidate,
  RTCPeerConnection,
  RTCSessionDescription
} from "@livekit/react-native-webrtc";
import {
  mobileDeviceId,
  mobileRealtimeClient
} from "../../../services/app-runtime";
import { createRequestId } from "../../../utils/app-ui";
import type { MobileCallUiSession } from "../../../types/app";
import type { MobileAppState } from "../../../app/controller/useMobileAppState";
import { i18n } from "../../../i18n";
import log from "../../../utils/log";

const signalingLog = log.scope("call-sdp");

export function createCallSignaling(deps: {
  state: MobileAppState;
  ensurePeerConnection: (
    session: MobileCallUiSession,
    remoteDeviceId?: string
  ) => Promise<RTCPeerConnection>;
  flushPendingIceCandidates: () => Promise<void>;
  getRemoteParticipant: (
    session: MobileCallUiSession,
    preferredDeviceId?: string
  ) => MobileCallUiSession["participants"][number] | null;
}) {
  const {
    state,
    ensurePeerConnection,
    flushPendingIceCandidates,
    getRemoteParticipant
  } = deps;

  async function createOfferForSession(
    session: MobileCallUiSession,
    remoteDeviceId?: string
  ) {
    const remoteParticipant = getRemoteParticipant(session, remoteDeviceId);
    if (!remoteParticipant) {
      return;
    }

    const offerKey = `${session.call_id}:${remoteParticipant.device_id ?? "unknown"}`;
    if (state.offerCreationKeyRef.current === offerKey) {
      return;
    }
    state.offerCreationKeyRef.current = offerKey;

    try {
      const connection = await ensurePeerConnection(
        session,
        remoteParticipant.device_id
      );

      if (
        connection.signalingState !== "stable" ||
        connection.localDescription?.type === "offer"
      ) {
        return;
      }

      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);

      if (!connection.localDescription) {
        return;
      }

      const localType = connection.localDescription.type;
      if (!localType) {
        return;
      }

      await mobileRealtimeClient.sendMessage({
        messageClassify: "offer",
        call_id: session.call_id,
        conversation_id: session.conversation_id,
        call_scope: session.call_scope,
        media_type: session.media_type,
        sender_user_id: state.snapshot?.auth.user?.userId ?? 0,
        sender_device_id: mobileDeviceId,
        request_id: createRequestId(),
        timestamp: new Date().toISOString(),
        target_user_id: remoteParticipant.user_id,
        target_device_id: remoteParticipant.device_id,
        description: {
          type: localType as "offer" | "answer" | "pranswer" | "rollback",
          sdp: connection.localDescription.sdp ?? undefined
        }
      });
    } finally {
      if (state.offerCreationKeyRef.current === offerKey) {
        state.offerCreationKeyRef.current = null;
      }
    }
  }

  async function handleRemoteDescription(signal: OfferMessage | AnswerMessage) {
    const session = state.callSessionRef.current;
    if (!session) {
      return;
    }

    // A stale signal (e.g. a leftover offer racing the hang-up) must not
    // drive the peer connection after the call has ended.
    if (
      session.phase === "ended" ||
      session.phase === "rejected" ||
      session.phase === "timeout"
    ) {
      return;
    }

    if (!signal.description.sdp) {
      throw new Error(i18n.t("callActions.sdpMissing"));
    }

    const connection = await ensurePeerConnection(
      session,
      signal.sender_device_id
    );

    if (connection.signalingState === "closed") {
      return;
    }

    const description = new RTCSessionDescription({
      type: signal.description.type,
      sdp: signal.description.sdp
    });

    if (signal.messageClassify === "offer") {
      // 本端已有本地 offer（正在协商）时收到远端 offer：先 rollback 再应用，
      // 轻量对齐 WebRTC 完美协商（perfect negotiation），避免
      // "setRemoteDescription with an offer while a local offer is set"。
      if (connection.signalingState === "have-local-offer") {
        try {
          await connection.setLocalDescription({ type: "rollback", sdp: "" });
        } catch (rollbackError) {
          signalingLog.warn("rollback before remote offer failed", {
            callId: session.call_id,
            err:
              rollbackError instanceof Error
                ? rollbackError.message
                : String(rollbackError)
          });
          return;
        }
      }

      try {
        await connection.setRemoteDescription(description);
      } catch (remoteError) {
        // Duplicate / out-of-order offer: ignore it instead of surfacing a
        // user-facing error.
        signalingLog.warn("setRemoteDescription(offer) failed", {
          callId: session.call_id,
          err:
            remoteError instanceof Error
              ? remoteError.message
              : String(remoteError)
        });
        return;
      }
      await flushPendingIceCandidates();

      // `createAnswer` is only valid in have-remote-offer / have-local-pranswer;
      // anything else (stable, have-local-offer, closed) must not call it.
      if (
        connection.signalingState !== "have-remote-offer" &&
        connection.signalingState !== "have-local-pranswer"
      ) {
        return;
      }

      const answer = await connection.createAnswer();
      await connection.setLocalDescription(answer);

      if (!connection.localDescription) {
        return;
      }

      const localType = connection.localDescription.type;
      if (!localType) {
        return;
      }

      await mobileRealtimeClient.sendMessage({
        messageClassify: "answer",
        call_id: signal.call_id,
        conversation_id: signal.conversation_id,
        call_scope: signal.call_scope,
        media_type: signal.media_type,
        sender_user_id: state.snapshot?.auth.user?.userId ?? 0,
        sender_device_id: mobileDeviceId,
        request_id: createRequestId(),
        timestamp: new Date().toISOString(),
        target_user_id: signal.sender_user_id,
        target_device_id: signal.sender_device_id,
        description: {
          type: localType as "offer" | "answer" | "pranswer" | "rollback",
          sdp: connection.localDescription.sdp ?? undefined
        }
      });
      return;
    }

    try {
      await connection.setRemoteDescription(description);
    } catch (remoteError) {
      // Duplicate / stale answer: ignore.
      signalingLog.warn("setRemoteDescription(answer) failed", {
        callId: session.call_id,
        err:
          remoteError instanceof Error
            ? remoteError.message
            : String(remoteError)
      });
      return;
    }
    await flushPendingIceCandidates();
  }

  async function handleIceCandidate(signal: IceMessage) {
    const candidate = {
      candidate: signal.candidate.candidate,
      sdpMid: signal.candidate.sdpMid,
      sdpMLineIndex: signal.candidate.sdpMLineIndex,
      usernameFragment: signal.candidate.usernameFragment
    };

    const connection = state.peerConnectionRef.current;
    if (!connection || !connection.remoteDescription) {
      state.pendingIceCandidatesRef.current.push(candidate);
      return;
    }

    await connection.addIceCandidate(new RTCIceCandidate(candidate));
  }

  async function maybeCreateDirectCallOffer(session: MobileCallUiSession) {
    const localUserId = state.snapshot?.auth.user?.userId;
    if (
      session.call_scope !== CALL_SCOPE_DIRECT ||
      session.phase !== "ongoing" ||
      !shouldLocalUserCreateCallOffer({
        callScope: session.call_scope,
        initiatorUserId: session.session.initiator_user_id,
        localUserId
      })
    ) {
      return;
    }

    if (state.peerConnectionRef.current) {
      return;
    }

    const remoteParticipant = getRemoteParticipant(session);
    if (!remoteParticipant) {
      return;
    }

    await createOfferForSession(session, remoteParticipant.device_id);
  }

  return {
    createOfferForSession,
    handleRemoteDescription,
    handleIceCandidate,
    maybeCreateDirectCallOffer
  };
}
