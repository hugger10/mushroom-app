import { useCallback, useRef, useState } from "react";
import type { AnswerMessage, IceMessage, OfferMessage } from "@mushroom/shared";
import type { CallUiSession } from "../../types/chat";
import type { LoginUser } from "../../types/user";
import { stopMediaStream } from "../useChatHelpers";
import {
  applyIceCandidate as applyIceCandidateCore,
  applySignalDescription as applySignalDescriptionCore,
  closePeerConnection as closePeerConnectionCore,
  createOfferForCall as createOfferForCallCore,
  ensurePeerConnection as ensurePeerConnectionCore,
  flushPendingIceCandidates as flushPendingIceCandidatesCore
} from "./callPeerConnection";
import { getRemoteCallParticipant } from "./callSession";
import { resolveIceServers } from "./callIceServers";

type SendCallSignal = (
  message:
    | Omit<OfferMessage, "sender_user_id" | "sender_device_id" | "timestamp">
    | Omit<AnswerMessage, "sender_user_id" | "sender_device_id" | "timestamp">
    | Omit<IceMessage, "sender_user_id" | "sender_device_id" | "timestamp">
) => Promise<void>;

type UseDirectCallSignalingOptions = {
  loginUser: LoginUser | null;
  getSession: () => CallUiSession | null;
  getLocalStream: () => MediaStream | null;
  sendCallSignal: SendCallSignal;
};

export type DirectCallSignalingApi = {
  remoteCallStream: MediaStream | null;
  hasActivePeerConnection: () => boolean;
  closePeerConnection: () => void;
  createOfferForCall: (
    session: CallUiSession,
    remoteDeviceId?: string
  ) => Promise<void>;
  applySignalDescription: (
    signal: OfferMessage | AnswerMessage,
    session: CallUiSession
  ) => Promise<void>;
  applyIceCandidate: (signal: IceMessage) => Promise<void>;
};

/**
 * 负责 1:1 通话的 RTCPeerConnection 编排：建立/关闭 PC、SDP/ICE 处理。
 * 群通话的传输由 useGroupCallRoom 管理。
 */
export function useDirectCallSignaling({
  loginUser,
  getSession,
  getLocalStream,
  sendCallSignal
}: UseDirectCallSignalingOptions): DirectCallSignalingApi {
  const [remoteCallStream, setRemoteCallStream] = useState<MediaStream | null>(
    null
  );
  const remoteCallStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const peerConnectionCallIdRef = useRef<string | null>(null);
  const peerConnectionSetupKeyRef = useRef<string | null>(null);
  const peerConnectionSetupPromiseRef =
    useRef<Promise<RTCPeerConnection> | null>(null);
  const offerCreationKeyRef = useRef<string | null>(null);
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const lastBroadcastCallMediaStateRef = useRef<string | null>(null);
  // 与 callSessionRef 等价的内部引用 —— 通过 getSession 函数读取，
  // 但 callPeerConnection 的 onicecandidate 需要一个 ref，因此这里桥接一下。
  const sessionBridgeRef = useRef<CallUiSession | null>(null);

  const clearRemoteCallStream = useCallback(() => {
    stopMediaStream(remoteCallStreamRef.current);
    remoteCallStreamRef.current = null;
    setRemoteCallStream(null);
  }, []);

  // localCallStream 也需要一个 ref 形态给底层纯函数使用
  const localStreamBridgeRef = useRef<MediaStream | null>(null);

  const refreshBridgeRefs = useCallback(() => {
    sessionBridgeRef.current = getSession();
    localStreamBridgeRef.current = getLocalStream();
  }, [getSession, getLocalStream]);

  const getRemoteParticipant = useCallback(
    (session: CallUiSession | null, preferredDeviceId?: string) => {
      return getRemoteCallParticipant({
        session,
        loginUserId: loginUser?.userId,
        preferredDeviceId
      });
    },
    [loginUser?.userId]
  );

  const closePeerConnection = useCallback(() => {
    closePeerConnectionCore({
      peerConnectionRef,
      peerConnectionCallIdRef,
      peerConnectionSetupKeyRef,
      peerConnectionSetupPromiseRef,
      offerCreationKeyRef,
      pendingIceCandidatesRef,
      lastBroadcastCallMediaStateRef,
      clearRemoteCallStream
    });
  }, [clearRemoteCallStream]);

  const ensurePeerConnection = useCallback(
    async (session: CallUiSession, remoteDeviceId?: string) => {
      refreshBridgeRefs();
      return ensurePeerConnectionCore({
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
        localCallStreamRef: localStreamBridgeRef,
        callSessionRef: sessionBridgeRef
      });
    },
    [
      closePeerConnection,
      getRemoteParticipant,
      refreshBridgeRefs,
      sendCallSignal
    ]
  );

  const flushPendingIceCandidates = useCallback(async () => {
    await flushPendingIceCandidatesCore({
      peerConnectionRef,
      pendingIceCandidatesRef
    });
  }, []);

  const createOfferForCall = useCallback(
    async (session: CallUiSession, remoteDeviceId?: string) => {
      await createOfferForCallCore({
        session,
        remoteDeviceId,
        getRemoteParticipant,
        offerCreationKeyRef,
        ensurePeerConnection,
        sendCallSignal
      });
    },
    [ensurePeerConnection, getRemoteParticipant, sendCallSignal]
  );

  const applySignalDescription = useCallback(
    async (signal: OfferMessage | AnswerMessage, session: CallUiSession) => {
      await applySignalDescriptionCore({
        signal,
        session,
        ensurePeerConnection,
        flushPendingIceCandidates,
        sendCallSignal
      });
    },
    [ensurePeerConnection, flushPendingIceCandidates, sendCallSignal]
  );

  const applyIceCandidate = useCallback(async (signal: IceMessage) => {
    await applyIceCandidateCore({
      signal,
      peerConnectionRef,
      pendingIceCandidatesRef
    });
  }, []);

  const hasActivePeerConnection = useCallback(
    () => peerConnectionRef.current !== null,
    []
  );

  return {
    remoteCallStream,
    hasActivePeerConnection,
    closePeerConnection,
    createOfferForCall,
    applySignalDescription,
    applyIceCandidate
  };
}
