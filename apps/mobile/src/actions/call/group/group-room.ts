import { AudioSession, registerGlobals } from "@livekit/react-native";
import type { MediaStreamTrack } from "@livekit/react-native-webrtc";
import {
  ConnectionState,
  Room,
  Track,
  type LocalTrack,
  type RemoteParticipant,
  type RemoteTrackPublication
} from "livekit-client";
import {
  CALL_PARTICIPANT_STATUS_JOINED,
  CALL_SCOPE_GROUP
} from "@mushroom/shared";
import { mobileServerApi } from "../../../services/app-runtime";
import { mobileDeviceId } from "../../../services/runtime/device-identity";
import { sameUserId } from "../../../utils/app-ui";
import log from "../../../utils/log";
import type { MobileAppState } from "../../../app/controller/useMobileAppState";
import type {
  MobileCallUiSession,
  MobileGroupCallParticipantMedia
} from "../../../types/app";
import {
  buildLiveKitParticipantStream,
  parseLiveKitParticipantIdentity,
  parseLiveKitParticipantMetadata
} from "./group-participant";
import { i18n } from "../../../i18n";

const callLog = log.scope("call");

// `registerGlobals()` is also called from `index.js`, but LiveKit's
// `MediaStream`/`RTCPeerConnection` globals must exist before any track is
// adapted. Calling it again here is idempotent and protects against load-order
// surprises when this module is imported in isolation (e.g. tests).
registerGlobals();

type AudioSessionState = {
  started: boolean;
};

const audioSessionState: AudioSessionState = {
  started: false
};

async function startGroupAudioSession() {
  if (audioSessionState.started) {
    return;
  }
  try {
    await AudioSession.startAudioSession();
    audioSessionState.started = true;
  } catch (error) {
    callLog.warn("Failed to start LiveKit audio session", {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

async function stopGroupAudioSession() {
  if (!audioSessionState.started) {
    return;
  }
  try {
    await AudioSession.stopAudioSession();
  } catch (error) {
    callLog.warn("Failed to stop LiveKit audio session", {
      error: error instanceof Error ? error.message : String(error)
    });
  } finally {
    audioSessionState.started = false;
  }
}

function resolveParticipantDisplayName(options: {
  state: MobileAppState;
  conversationId: string;
  userId: number | null;
  deviceId: string | null;
  participantName?: string;
}): string {
  const conversation = options.state.conversations.find(
    item =>
      item.server_conversation_id === options.conversationId ||
      item.client_conversation_id === options.conversationId
  );
  const member = conversation?.members?.find(candidate =>
    options.userId === null
      ? false
      : sameUserId(candidate.user_id, options.userId)
  );

  return (
    member?.nickname ||
    options.participantName ||
    (options.userId !== null
      ? i18n.t("display.unknownUser", { id: options.userId })
      : "") ||
    (options.deviceId
      ? i18n.t("callActions.deviceFallback", { id: options.deviceId })
      : "") ||
    i18n.t("callActions.memberFallback")
  );
}

/**
 * Mirror the room's remote participants into `groupParticipantMedia` state so
 * the CallOverlay grid can render real remote video/audio. Mirrors the desktop
 * `syncGroupParticipantMedia` in `apps/web/src/hooks/call/useGroupCallRoom.ts`.
 */
function syncGroupParticipantMedia(deps: {
  state: MobileAppState;
  room: Room;
}) {
  const { state, room } = deps;
  const currentSession = state.callSessionRef.current;
  if (!currentSession || currentSession.call_scope !== CALL_SCOPE_GROUP) {
    state.setGroupParticipantMedia([]);
    return;
  }

  const nextParticipants: MobileGroupCallParticipantMedia[] = Array.from(
    room.remoteParticipants.values()
  )
    .map((participant: RemoteParticipant) => {
      const metadata = parseLiveKitParticipantMetadata(participant.metadata);
      const identity = parseLiveKitParticipantIdentity(participant.identity);
      const userId = metadata.userId ?? identity.userId;
      const deviceId = metadata.deviceId ?? identity.deviceId;
      const stream = buildLiveKitParticipantStream(participant);

      return {
        participant_identity: participant.identity,
        user_id: userId,
        device_id: deviceId,
        display_name: resolveParticipantDisplayName({
          state,
          conversationId: currentSession.conversation_id,
          userId,
          deviceId,
          participantName: participant.name
        }),
        stream_url: stream ? stream.toURL() : null,
        audio_enabled: participant.isMicrophoneEnabled,
        video_enabled: participant.isCameraEnabled,
        is_speaking: participant.isSpeaking
      } satisfies MobileGroupCallParticipantMedia;
    })
    .sort((left, right) => {
      const leftUserId = left.user_id ?? Number.MAX_SAFE_INTEGER;
      const rightUserId = right.user_id ?? Number.MAX_SAFE_INTEGER;
      if (leftUserId !== rightUserId) {
        return leftUserId - rightUserId;
      }
      return left.display_name.localeCompare(right.display_name, "zh-Hans");
    });

  state.setGroupParticipantMedia(nextParticipants);
}

/**
 * Publish the local stream's live tracks and unpublish tracks no longer
 * present, keeping the SFU view in sync with the local capture state. Mirrors
 * the desktop `syncGroupRoomLocalTracks`.
 */
export async function syncGroupRoomLocalTracks(deps: {
  state: MobileAppState;
  room: Room;
}) {
  const { state, room } = deps;
  const localParticipant = room.localParticipant;
  const localStream = state.localCallStreamRef.current;
  const desiredTracks = (
    localStream?.getTracks().filter(track => track.readyState === "live") ?? []
  ).filter(track => !track.label.toLowerCase().includes("screen"));
  const desiredTrackIds = new Set(desiredTracks.map(track => track.id));
  const publishedTracks = Array.from(
    localParticipant.trackPublications.values()
  )
    .map(publication => publication.track?.mediaStreamTrack ?? null)
    .filter((track): track is MediaStreamTrack => Boolean(track));

  for (const publishedTrack of publishedTracks) {
    if (!desiredTrackIds.has(publishedTrack.id)) {
      await localParticipant.unpublishTrack(
        publishedTrack as unknown as MediaStreamTrack &
          Parameters<typeof localParticipant.unpublishTrack>[0],
        false
      );
    }
  }

  for (const track of desiredTracks) {
    const alreadyPublished = publishedTracks.some(
      publishedTrack => publishedTrack.id === track.id
    );
    if (!alreadyPublished) {
      const source =
        track.kind === "video" ? Track.Source.Camera : Track.Source.Microphone;
      await localParticipant.publishTrack(
        track as unknown as LocalTrack | MediaStreamTrack,
        { source }
      );
    }
  }
}

export function createGroupRoomActions(deps: { state: MobileAppState }) {
  const { state } = deps;

  function clearGroupParticipantMedia() {
    state.setGroupParticipantMedia([]);
    state.setGroupLocalSpeaking(false);
  }

  async function disconnectGroupCallRoom() {
    const currentRoom = state.liveKitRoomRef.current;
    const currentCallId = state.liveKitRoomCallIdRef.current;
    state.liveKitRoomRef.current = null;
    state.liveKitRoomCallIdRef.current = null;
    state.liveKitRoomConnectPromiseRef.current = null;
    clearGroupParticipantMedia();

    if (!currentRoom) {
      await stopGroupAudioSession();
      return;
    }

    try {
      currentRoom.removeAllListeners();
      if (currentRoom.state !== ConnectionState.Disconnected) {
        await currentRoom.disconnect(false);
      }
    } catch (error) {
      callLog.warn("Failed to disconnect LiveKit room", {
        callId: currentCallId,
        error: error instanceof Error ? error.message : String(error)
      });
    } finally {
      await stopGroupAudioSession();
    }
  }

  async function ensureGroupCallRoom(session: MobileCallUiSession) {
    if (session.call_scope !== CALL_SCOPE_GROUP) {
      return null;
    }

    const existingRoom = state.liveKitRoomRef.current;
    if (
      existingRoom &&
      state.liveKitRoomCallIdRef.current === session.call_id &&
      existingRoom.state !== ConnectionState.Disconnected
    ) {
      await syncGroupRoomLocalTracks({ state, room: existingRoom });
      syncGroupParticipantMedia({ state, room: existingRoom });
      return existingRoom;
    }

    if (
      state.liveKitRoomConnectPromiseRef.current &&
      state.liveKitRoomCallIdRef.current === session.call_id
    ) {
      return state.liveKitRoomConnectPromiseRef.current;
    }

    await disconnectGroupCallRoom();
    state.liveKitRoomCallIdRef.current = session.call_id;

    const connectPromise = (async () => {
      const roomConfig = await mobileServerApi.getCallRoomConfig({
        callId: session.call_id
      });
      state.setCallRoomInfo(roomConfig.data);

      await startGroupAudioSession();

      const nextRoom = new Room({
        adaptiveStream: true,
        dynacast: true
      });

      const handleRoomChange = () => {
        syncGroupParticipantMedia({ state, room: nextRoom });
      };

      const handleActiveSpeakersChanged = () => {
        // Refresh remote tiles (`is_speaking`) and the local speaking ring.
        syncGroupParticipantMedia({ state, room: nextRoom });
        state.setGroupLocalSpeaking(nextRoom.localParticipant.isSpeaking);
      };

      nextRoom.on("participantConnected", handleRoomChange);
      nextRoom.on("participantDisconnected", handleRoomChange);
      nextRoom.on("participantMetadataChanged", handleRoomChange);
      nextRoom.on("participantNameChanged", handleRoomChange);
      nextRoom.on("trackPublished", handleRoomChange);
      nextRoom.on("trackSubscribed", handleRoomChange);
      nextRoom.on("trackUnpublished", handleRoomChange);
      nextRoom.on("trackUnsubscribed", handleRoomChange);
      nextRoom.on("trackMuted", handleRoomChange);
      nextRoom.on("trackUnmuted", handleRoomChange);
      nextRoom.on("activeSpeakersChanged", handleActiveSpeakersChanged);
      nextRoom.on("disconnected", () => {
        if (state.liveKitRoomRef.current === nextRoom) {
          state.liveKitRoomRef.current = null;
          state.liveKitRoomCallIdRef.current = null;
          clearGroupParticipantMedia();
          void stopGroupAudioSession();
        }
      });

      await nextRoom.connect(
        roomConfig.data.server_url,
        roomConfig.data.access_token
      );
      state.liveKitRoomRef.current = nextRoom;
      state.liveKitRoomCallIdRef.current = session.call_id;

      await syncGroupRoomLocalTracks({ state, room: nextRoom });
      syncGroupParticipantMedia({ state, room: nextRoom });
      return nextRoom;
    })();

    state.liveKitRoomConnectPromiseRef.current = connectPromise;
    try {
      return await connectPromise;
    } catch (error) {
      state.liveKitRoomCallIdRef.current = null;
      clearGroupParticipantMedia();
      await stopGroupAudioSession();
      throw error;
    } finally {
      if (state.liveKitRoomConnectPromiseRef.current === connectPromise) {
        state.liveKitRoomConnectPromiseRef.current = null;
      }
    }
  }

  /**
   * Whether the local user has joined the group call (server-authoritative
   * `participant_status === JOINED`). The room is only joined for participants
   * that have accepted; ringing/declined participants stay out of the SFU.
   */
  function localParticipantJoined(session: MobileCallUiSession): boolean {
    const localUserId = state.snapshot?.auth.user?.userId;
    if (localUserId == null) {
      return false;
    }
    const candidates = session.participants.filter(participant =>
      sameUserId(participant.user_id, localUserId)
    );
    // Prefer the participant entry for this device; fall back to the first
    // candidate. Mirrors the desktop `getLocalCallParticipant` so a user signed
    // in on multiple devices in the same group call reads this device's
    // authoritative `participant_status`.
    const local =
      candidates.find(
        participant => participant.device_id === mobileDeviceId
      ) ?? candidates[0];
    return local?.participant_status === CALL_PARTICIPANT_STATUS_JOINED;
  }

  return {
    ensureGroupCallRoom,
    disconnectGroupCallRoom,
    syncLocalTracks: (room: Room) => syncGroupRoomLocalTracks({ state, room }),
    localParticipantJoined,
    clearGroupParticipantMedia
  };
}

export type GroupRoomActions = ReturnType<typeof createGroupRoomActions>;

// Re-export for callers that need the raw publication type (kept for parity
// with the desktop module surface).
export type { RemoteTrackPublication };
