import { i18n } from "../../i18n";
import { message as antdMessage } from "antd";
import log from "@/utils/log";
import { v4 as uuidv4 } from "uuid";
import { CALL_MEDIA_TYPE_VIDEO } from "@mushroom/shared";

const callLog = log.scope("call");
import type { AnswerMessage, IceMessage, OfferMessage } from "@mushroom/shared";
import type { CallUiSession } from "../../types/chat";
import {
  isCallMediaDebugEnabled,
  shouldForceRelayTransport
} from "../useChatHelpers";
import {
  logIceFailureSnapshot,
  logSelectedIceCandidatePair,
  parseIceCandidateType
} from "./callIce";

type MutableRef<T> = {
  current: T;
};

type CallParticipant = CallUiSession["participants"][number];

type SendCallSignal = (
  message:
    | Omit<OfferMessage, "sender_user_id" | "sender_device_id" | "timestamp">
    | Omit<AnswerMessage, "sender_user_id" | "sender_device_id" | "timestamp">
    | Omit<IceMessage, "sender_user_id" | "sender_device_id" | "timestamp">
) => Promise<void>;

export function closePeerConnection(options: {
  peerConnectionRef: MutableRef<RTCPeerConnection | null>;
  peerConnectionCallIdRef: MutableRef<string | null>;
  peerConnectionSetupKeyRef: MutableRef<string | null>;
  peerConnectionSetupPromiseRef: MutableRef<Promise<RTCPeerConnection> | null>;
  offerCreationKeyRef: MutableRef<string | null>;
  pendingIceCandidatesRef: MutableRef<RTCIceCandidateInit[]>;
  lastBroadcastCallMediaStateRef: MutableRef<string | null>;
  clearRemoteCallStream: () => void;
}) {
  if (options.peerConnectionRef.current) {
    options.peerConnectionRef.current.ontrack = null;
    options.peerConnectionRef.current.onicecandidate = null;
    options.peerConnectionRef.current.onconnectionstatechange = null;
    options.peerConnectionRef.current.close();
    options.peerConnectionRef.current = null;
  }
  options.peerConnectionCallIdRef.current = null;
  options.peerConnectionSetupKeyRef.current = null;
  options.peerConnectionSetupPromiseRef.current = null;
  options.offerCreationKeyRef.current = null;
  options.pendingIceCandidatesRef.current = [];
  options.lastBroadcastCallMediaStateRef.current = null;
  options.clearRemoteCallStream();
}

export async function ensurePeerConnection(options: {
  session: CallUiSession;
  remoteDeviceId?: string;
  peerConnectionRef: MutableRef<RTCPeerConnection | null>;
  peerConnectionCallIdRef: MutableRef<string | null>;
  closePeerConnection: () => void;
  remoteCallStreamRef: MutableRef<MediaStream | null>;
  setRemoteCallStream: (stream: MediaStream | null) => void;
  resolveIceServers: () => Promise<RTCIceServer[]>;
  getRemoteParticipant: (
    session: CallUiSession | null,
    preferredDeviceId?: string
  ) => CallParticipant | null;
  sendCallSignal: SendCallSignal;
  localCallStreamRef: MutableRef<MediaStream | null>;
  callSessionRef: MutableRef<CallUiSession | null>;
}) {
  const {
    session,
    remoteDeviceId,
    peerConnectionRef,
    peerConnectionCallIdRef,
    closePeerConnection,
    remoteCallStreamRef,
    setRemoteCallStream,
    resolveIceServers,
    getRemoteParticipant,
    sendCallSignal,
    localCallStreamRef,
    callSessionRef
  } = options;

  const existing = peerConnectionRef.current;
  if (
    existing &&
    peerConnectionCallIdRef.current === session.call_id &&
    getRemoteParticipant(session, remoteDeviceId)
  ) {
    return existing;
  }

  closePeerConnection();

  const remoteStream = new MediaStream();
  remoteCallStreamRef.current = remoteStream;
  setRemoteCallStream(remoteStream);
  const iceServers = await resolveIceServers();
  const forceRelay = shouldForceRelayTransport();

  if (isCallMediaDebugEnabled()) {
    callLog.info("Creating RTCPeerConnection for call", {
      callId: session.call_id,
      forceRelay,
      iceServers
    });
  }

  const connection = new RTCPeerConnection({
    iceServers,
    iceTransportPolicy: forceRelay ? "relay" : "all"
  });
  peerConnectionRef.current = connection;
  peerConnectionCallIdRef.current = session.call_id;

  connection.ontrack = event => {
    const primaryStream = event.streams[0];
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
  };

  connection.onicecandidate = event => {
    if (!event.candidate) {
      return;
    }
    if (isCallMediaDebugEnabled()) {
      callLog.info("Generated local ICE candidate", {
        callId: session.call_id,
        protocol: event.candidate.protocol ?? null,
        candidateType: parseIceCandidateType(event.candidate.candidate),
        sdpMid: event.candidate.sdpMid ?? null
      });
    }
    const latestSession = callSessionRef.current;
    const remoteParticipant = getRemoteParticipant(
      latestSession,
      remoteDeviceId
    );
    if (!latestSession || !remoteParticipant) {
      return;
    }
    void sendCallSignal({
      messageClassify: "ice",
      call_id: latestSession.call_id,
      conversation_id: latestSession.conversation_id,
      call_scope: latestSession.call_scope,
      media_type: latestSession.media_type,
      request_id: uuidv4(),
      target_user_id: remoteParticipant.user_id,
      target_device_id: remoteParticipant.device_id,
      candidate: {
        candidate: event.candidate.candidate,
        sdpMid: event.candidate.sdpMid,
        sdpMLineIndex: event.candidate.sdpMLineIndex,
        usernameFragment: event.candidate.usernameFragment
      }
    }).catch(error => {
      callLog.warn("send ICE failed", {
        callId: latestSession.call_id,
        err: error instanceof Error ? error.message : String(error)
      });
    });
  };

  connection.onicecandidateerror = event => {
    callLog.warn("Call ICE candidate error", {
      callId: session.call_id,
      url: event.url ?? null,
      address: event.address ?? null,
      port: event.port ?? null,
      errorCode: event.errorCode ?? null,
      errorText: event.errorText ?? null
    });
  };

  connection.onconnectionstatechange = () => {
    const state = connection.connectionState;
    if (isCallMediaDebugEnabled()) {
      callLog.info("Call connection state changed", {
        callId: session.call_id,
        state
      });
    }
    if (state === "failed") {
      callLog.warn(
        "Call peer connection failed without server terminal event",
        {
          callId: session.call_id,
          signalingState: connection.signalingState,
          iceConnectionState: connection.iceConnectionState
        }
      );
      void logIceFailureSnapshot(connection, session.call_id);
      antdMessage.warning(i18n.t("callActions.mediaConnectionFailed"));
    }
  };

  connection.oniceconnectionstatechange = () => {
    const state = connection.iceConnectionState;
    if (isCallMediaDebugEnabled()) {
      callLog.info("Call ICE connection state changed", {
        callId: session.call_id,
        state
      });
    }
    if (state === "connected" || state === "completed") {
      void logSelectedIceCandidatePair(connection, session.call_id);
    }
  };

  const localStream = localCallStreamRef.current;
  if (localStream) {
    for (const track of localStream.getTracks()) {
      connection.addTrack(track, localStream);
    }
  }

  const hasLocalAudioTrack = Boolean(localStream?.getAudioTracks().length);
  const hasLocalVideoTrack = Boolean(localStream?.getVideoTracks().length);

  if (!hasLocalAudioTrack) {
    connection.addTransceiver("audio", { direction: "recvonly" });
  }
  if (session.media_type === CALL_MEDIA_TYPE_VIDEO && !hasLocalVideoTrack) {
    connection.addTransceiver("video", { direction: "recvonly" });
  }

  return connection;
}

export async function flushPendingIceCandidates(options: {
  peerConnectionRef: MutableRef<RTCPeerConnection | null>;
  pendingIceCandidatesRef: MutableRef<RTCIceCandidateInit[]>;
}) {
  const connection = options.peerConnectionRef.current;
  if (!connection || !connection.remoteDescription) {
    return;
  }

  const queuedCandidates = [...options.pendingIceCandidatesRef.current];
  options.pendingIceCandidatesRef.current = [];
  for (const candidate of queuedCandidates) {
    await connection.addIceCandidate(candidate);
  }
}

export async function createOfferForCall(options: {
  session: CallUiSession;
  remoteDeviceId?: string;
  getRemoteParticipant: (
    session: CallUiSession | null,
    preferredDeviceId?: string
  ) => CallParticipant | null;
  offerCreationKeyRef: MutableRef<string | null>;
  ensurePeerConnection: (
    session: CallUiSession,
    remoteDeviceId?: string
  ) => Promise<RTCPeerConnection>;
  sendCallSignal: SendCallSignal;
}) {
  const {
    session,
    remoteDeviceId,
    getRemoteParticipant,
    offerCreationKeyRef,
    ensurePeerConnection,
    sendCallSignal
  } = options;
  const remoteParticipant = getRemoteParticipant(session, remoteDeviceId);
  if (!remoteParticipant) {
    return;
  }

  const offerKey = `${session.call_id}:${remoteParticipant.device_id}`;
  if (offerCreationKeyRef.current === offerKey) {
    return;
  }
  offerCreationKeyRef.current = offerKey;

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
    const localDescription = connection.localDescription;
    if (!localDescription) {
      return;
    }

    await sendCallSignal({
      messageClassify: "offer",
      call_id: session.call_id,
      conversation_id: session.conversation_id,
      call_scope: session.call_scope,
      media_type: session.media_type,
      request_id: uuidv4(),
      target_user_id: remoteParticipant.user_id,
      target_device_id: remoteParticipant.device_id,
      description: {
        type: localDescription.type,
        sdp: localDescription.sdp ?? undefined
      }
    });
  } finally {
    if (offerCreationKeyRef.current === offerKey) {
      offerCreationKeyRef.current = null;
    }
  }
}

export async function applySignalDescription(options: {
  signal: OfferMessage | AnswerMessage;
  session: CallUiSession;
  ensurePeerConnection: (
    session: CallUiSession,
    remoteDeviceId?: string
  ) => Promise<RTCPeerConnection>;
  flushPendingIceCandidates: () => Promise<void>;
  sendCallSignal: SendCallSignal;
}) {
  const {
    signal,
    session,
    ensurePeerConnection,
    flushPendingIceCandidates,
    sendCallSignal
  } = options;
  const connection = await ensurePeerConnection(
    session,
    signal.sender_device_id
  );

  const description: RTCSessionDescriptionInit = {
    type: signal.description.type,
    sdp: signal.description.sdp
  };

  if (signal.messageClassify === "offer") {
    await connection.setRemoteDescription(description);
    await flushPendingIceCandidates();
    const answer = await connection.createAnswer();
    await connection.setLocalDescription(answer);
    if (!connection.localDescription) {
      return;
    }

    await sendCallSignal({
      messageClassify: "answer",
      call_id: signal.call_id,
      conversation_id: signal.conversation_id,
      call_scope: signal.call_scope,
      media_type: signal.media_type,
      request_id: uuidv4(),
      target_user_id: signal.sender_user_id,
      target_device_id: signal.sender_device_id,
      description: {
        type: connection.localDescription.type,
        sdp: connection.localDescription.sdp ?? undefined
      }
    });
    return;
  }

  await connection.setRemoteDescription(description);
  await flushPendingIceCandidates();
}

export async function applyIceCandidate(options: {
  signal: IceMessage;
  peerConnectionRef: MutableRef<RTCPeerConnection | null>;
  pendingIceCandidatesRef: MutableRef<RTCIceCandidateInit[]>;
}) {
  const candidate: RTCIceCandidateInit = {
    candidate: options.signal.candidate.candidate,
    sdpMid: options.signal.candidate.sdpMid,
    sdpMLineIndex: options.signal.candidate.sdpMLineIndex,
    usernameFragment: options.signal.candidate.usernameFragment
  };
  const connection = options.peerConnectionRef.current;

  if (!connection || !connection.remoteDescription) {
    options.pendingIceCandidatesRef.current.push(candidate);
    return;
  }

  await connection.addIceCandidate(candidate);
}
