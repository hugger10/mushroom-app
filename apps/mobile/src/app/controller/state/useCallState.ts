import { useRef, useState } from "react";
import type {
  MediaStream,
  RTCPeerConnection
} from "@livekit/react-native-webrtc";
import type { Room } from "livekit-client";
import type {
  CallIceConfigResponse,
  CallRoomConfigResponse
} from "@mushroom/shared";
import { mobileCallSoundPlayer } from "../../../platform/call-sound-player";
import type { MobileRealtimeStatus } from "../../../services/realtime";
import type {
  MobileCallUiSession,
  MobileGroupCallParticipantMedia
} from "../../../types/app";

export function useCallState() {
  const [callSession, setCallSession] = useState<MobileCallUiSession | null>(
    null
  );
  const [localCallStreamUrl, setLocalCallStreamUrl] = useState<string | null>(
    null
  );
  const [remoteCallStreamUrl, setRemoteCallStreamUrl] = useState<string | null>(
    null
  );
  const [callIceInfo, setCallIceInfo] = useState<CallIceConfigResponse | null>(
    null
  );
  const [callRoomInfo, setCallRoomInfo] =
    useState<CallRoomConfigResponse | null>(null);
  const [groupParticipantMedia, setGroupParticipantMedia] = useState<
    MobileGroupCallParticipantMedia[]
  >([]);
  // Whether the local user is currently speaking in a group call, derived from
  // LiveKit's `activeSpeakersChanged` event. Drives the local tile's
  // active-speaker ring.
  const [groupLocalSpeaking, setGroupLocalSpeaking] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState<MobileRealtimeStatus>({
    status: "idle",
    attempt: 0,
    maxAttempts: 5
  });
  const callDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const callSessionRef = useRef<MobileCallUiSession | null>(null);
  const localCallStreamRef = useRef<MediaStream | null>(null);
  const remoteCallStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const peerConnectionCallIdRef = useRef<string | null>(null);
  const pendingIceCandidatesRef = useRef<
    Array<{
      candidate: string;
      sdpMid?: string | null;
      sdpMLineIndex?: number | null;
      usernameFragment?: string | null;
    }>
  >([]);
  const offerCreationKeyRef = useRef<string | null>(null);

  // LiveKit group-call room state. The room is connected once the local user
  // is JOINED and the call is `ongoing`; refs mirror the desktop
  // `useGroupCallRoom` orchestration but live on the shared call state so the
  // non-hook action factories can drive them.
  const liveKitRoomRef = useRef<Room | null>(null);
  const liveKitRoomCallIdRef = useRef<string | null>(null);
  const liveKitRoomConnectPromiseRef = useRef<Promise<Room | null> | null>(
    null
  );
  // Registered by the call media action factory so that synchronous UI
  // dismissal can route group-room teardown through `disconnectGroupCallRoom`,
  // which is the only path that stops the LiveKit `AudioSession`. Tearing the
  // room down inline here would bypass the `disconnected` listener and leave
  // the native audio session started.
  const liveKitRoomTeardownRef = useRef<(() => void) | null>(null);

  function stopCallStream(
    stream: MediaStream | null,
    options: { stopTracks: boolean }
  ) {
    if (!stream) {
      return;
    }

    if (options.stopTracks) {
      for (const track of stream.getTracks()) {
        try {
          track.stop();
        } catch {
          // Ignore native stop failures while tearing down the call UI.
        }
      }
    }
  }

  function clearCallDismissTimer() {
    if (callDismissTimerRef.current) {
      clearTimeout(callDismissTimerRef.current);
      callDismissTimerRef.current = null;
    }
  }

  function dismissCallSessionNow() {
    clearCallDismissTimer();
    mobileCallSoundPlayer.stopLoop();
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    peerConnectionCallIdRef.current = null;
    pendingIceCandidatesRef.current = [];
    offerCreationKeyRef.current = null;
    // Tear down the LiveKit room if a group call was active. Delegate to
    // `disconnectGroupCallRoom` (registered via `liveKitRoomTeardownRef`) so the
    // room is disconnected AND the native audio session is stopped through the
    // single canonical teardown path. `disconnect` is async; we fire-and-forget
    // because the UI dismissal is synchronous.
    const teardownGroupRoom = liveKitRoomTeardownRef.current;
    if (teardownGroupRoom) {
      teardownGroupRoom();
    } else {
      // Fallback if no group-room teardown has been registered yet (e.g. before
      // the media action factory ran). Clear the refs so stale state does not
      // linger; there is no connected room to disconnect in this case.
      liveKitRoomRef.current = null;
      liveKitRoomCallIdRef.current = null;
      liveKitRoomConnectPromiseRef.current = null;
    }
    stopCallStream(localCallStreamRef.current, { stopTracks: true });
    stopCallStream(remoteCallStreamRef.current, { stopTracks: false });
    localCallStreamRef.current = null;
    remoteCallStreamRef.current = null;
    setCallSession(null);
    setLocalCallStreamUrl(null);
    setRemoteCallStreamUrl(null);
    setCallRoomInfo(null);
    setCallIceInfo(null);
    setGroupParticipantMedia([]);
    setGroupLocalSpeaking(false);
  }

  return {
    callSession,
    setCallSession,
    localCallStreamUrl,
    setLocalCallStreamUrl,
    remoteCallStreamUrl,
    setRemoteCallStreamUrl,
    callIceInfo,
    setCallIceInfo,
    callRoomInfo,
    setCallRoomInfo,
    groupParticipantMedia,
    setGroupParticipantMedia,
    groupLocalSpeaking,
    setGroupLocalSpeaking,
    realtimeStatus,
    setRealtimeStatus,
    callDismissTimerRef,
    callSessionRef,
    localCallStreamRef,
    remoteCallStreamRef,
    peerConnectionRef,
    peerConnectionCallIdRef,
    pendingIceCandidatesRef,
    offerCreationKeyRef,
    liveKitRoomRef,
    liveKitRoomCallIdRef,
    liveKitRoomConnectPromiseRef,
    liveKitRoomTeardownRef,
    clearCallDismissTimer,
    dismissCallSessionNow
  };
}
