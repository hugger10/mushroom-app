import { CALL_MEDIA_TYPE_VIDEO } from "@mushroom/shared";
import {
  MediaStream,
  RTCIceCandidate,
  RTCPeerConnection
} from "@livekit/react-native-webrtc";
import {
  mobileDeviceId,
  mobileRealtimeClient
} from "../../../services/app-runtime";
import { createRequestId } from "../../../utils/app-ui";
import type { MobileCallUiSession } from "../../../types/app";
import type { MobileAppState } from "../../../app/controller/useMobileAppState";
import type { IceServerList } from "./streams";
import { i18n } from "../../../i18n";

export function createPeerConnectionLifecycle(deps: {
  state: MobileAppState;
  replaceRemoteCallStream: (stream: MediaStream | null) => void;
  resolveIceServers: () => Promise<IceServerList>;
  getRemoteParticipant: (
    session: MobileCallUiSession,
    preferredDeviceId?: string
  ) => MobileCallUiSession["participants"][number] | null;
}) {
  const {
    state,
    replaceRemoteCallStream,
    resolveIceServers,
    getRemoteParticipant
  } = deps;

  function closePeerConnection() {
    const connection = state.peerConnectionRef.current;
    if (connection) {
      (
        connection as RTCPeerConnection & {
          ontrack?: ((event: any) => void) | null;
          onaddstream?: ((event: { stream: MediaStream }) => void) | null;
          onremovestream?: ((event: { stream: MediaStream }) => void) | null;
          onicecandidate?: ((event: unknown) => void) | null;
          onconnectionstatechange?: (() => void) | null;
        }
      ).ontrack = null;
      (
        connection as RTCPeerConnection & {
          onaddstream?: ((event: { stream: MediaStream }) => void) | null;
        }
      ).onaddstream = null;
      (
        connection as RTCPeerConnection & {
          onremovestream?: ((event: { stream: MediaStream }) => void) | null;
        }
      ).onremovestream = null;
      (
        connection as RTCPeerConnection & {
          onicecandidate?: ((event: unknown) => void) | null;
        }
      ).onicecandidate = null;
      (
        connection as RTCPeerConnection & {
          onconnectionstatechange?: (() => void) | null;
        }
      ).onconnectionstatechange = null;
      connection.close();
      state.peerConnectionRef.current = null;
    }

    state.peerConnectionCallIdRef.current = null;
    state.pendingIceCandidatesRef.current = [];
    state.offerCreationKeyRef.current = null;
    replaceRemoteCallStream(null);
  }

  async function ensurePeerConnection(
    session: MobileCallUiSession,
    remoteDeviceId?: string
  ) {
    const existing = state.peerConnectionRef.current;
    if (
      existing &&
      state.peerConnectionCallIdRef.current === session.call_id &&
      getRemoteParticipant(session, remoteDeviceId)
    ) {
      return existing;
    }

    closePeerConnection();

    const iceServers = await resolveIceServers();
    replaceRemoteCallStream(null);

    const connection = new RTCPeerConnection({
      iceServers
    });
    const remoteStream = new MediaStream();
    state.remoteCallStreamRef.current = remoteStream;

    state.peerConnectionRef.current = connection;
    state.peerConnectionCallIdRef.current = session.call_id;

    (
      connection as RTCPeerConnection & {
        ontrack?: ((event: any) => void) | null;
        onaddstream?: ((event: { stream: MediaStream }) => void) | null;
        onremovestream?: ((event: { stream: MediaStream }) => void) | null;
      }
    ).ontrack = event => {
      const primaryStream = event.streams?.[0] as MediaStream | undefined;
      const incomingTracks = primaryStream
        ? primaryStream.getTracks()
        : [event.track];
      for (const track of incomingTracks) {
        const alreadyAdded = remoteStream
          .getTracks()
          .some(existingTrack => existingTrack.id === track.id);
        if (!alreadyAdded) {
          remoteStream.addTrack(track);
        }
      }
      replaceRemoteCallStream(remoteStream);
    };

    (
      connection as RTCPeerConnection & {
        onaddstream?: ((event: { stream: MediaStream }) => void) | null;
      }
    ).onaddstream = event => {
      if (!event.stream) {
        return;
      }

      for (const track of event.stream.getTracks()) {
        const alreadyAdded = remoteStream
          .getTracks()
          .some(existingTrack => existingTrack.id === track.id);
        if (!alreadyAdded) {
          remoteStream.addTrack(track);
        }
      }
      replaceRemoteCallStream(remoteStream);
    };

    (
      connection as RTCPeerConnection & {
        onremovestream?: ((event: { stream: MediaStream }) => void) | null;
      }
    ).onremovestream = () => {
      replaceRemoteCallStream(null);
    };

    (
      connection as unknown as {
        onicecandidate?:
          | ((event: {
              candidate?: {
                candidate: string;
                sdpMid?: string | null;
                sdpMLineIndex?: number | null;
                usernameFragment?: string | null;
              } | null;
            }) => void)
          | null;
      }
    ).onicecandidate = event => {
      if (!event.candidate) {
        return;
      }

      const currentSession = state.callSessionRef.current;
      if (!currentSession) {
        return;
      }

      const remoteParticipant = getRemoteParticipant(
        currentSession,
        remoteDeviceId
      );
      if (!remoteParticipant) {
        return;
      }

      void mobileRealtimeClient.sendMessage({
        messageClassify: "ice",
        call_id: currentSession.call_id,
        conversation_id: currentSession.conversation_id,
        call_scope: currentSession.call_scope,
        media_type: currentSession.media_type,
        sender_user_id: state.snapshot?.auth.user?.userId ?? 0,
        sender_device_id: mobileDeviceId,
        request_id: createRequestId(),
        timestamp: new Date().toISOString(),
        target_user_id: remoteParticipant.user_id,
        target_device_id: remoteParticipant.device_id,
        candidate: {
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
          usernameFragment: event.candidate.usernameFragment
        }
      });
    };

    (
      connection as RTCPeerConnection & {
        onconnectionstatechange?: (() => void) | null;
      }
    ).onconnectionstatechange = () => {
      if (connection.connectionState === "failed") {
        state.setError(i18n.t("callActions.mediaConnectionFailed"));
      }
    };

    const localStream = state.localCallStreamRef.current;
    if (localStream) {
      for (const track of localStream.getTracks()) {
        connection.addTrack(track, localStream);
      }
    }

    if (!localStream?.getAudioTracks().length) {
      connection.addTransceiver("audio", { direction: "recvonly" });
    }

    if (
      session.media_type === CALL_MEDIA_TYPE_VIDEO &&
      !localStream?.getVideoTracks().length
    ) {
      connection.addTransceiver("video", { direction: "recvonly" });
    }

    return connection;
  }

  async function flushPendingIceCandidates() {
    const connection = state.peerConnectionRef.current;
    if (!connection || !connection.remoteDescription) {
      return;
    }

    const queuedCandidates = [...state.pendingIceCandidatesRef.current];
    state.pendingIceCandidatesRef.current = [];

    for (const candidate of queuedCandidates) {
      await connection.addIceCandidate(new RTCIceCandidate(candidate));
    }
  }

  return {
    closePeerConnection,
    ensurePeerConnection,
    flushPendingIceCandidates
  };
}
