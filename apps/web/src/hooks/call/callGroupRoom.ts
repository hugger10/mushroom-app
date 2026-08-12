import log from "@/utils/log";
import { ConnectionState, Room, Track } from "livekit-client";
import { CALL_SCOPE_GROUP } from "@mushroom/shared";
import type { CallUiSession } from "../../types/chat";
import { fetchCallRoomConfig } from "../../http/api";

type MutableRef<T> = {
  current: T;
};

export async function syncGroupRoomLocalTracks(options: {
  room: Room;
  localCallStream: MediaStream | null;
}) {
  const localParticipant = options.room.localParticipant;
  const desiredTracks = (
    options.localCallStream?.getTracks().filter(track => {
      return track.readyState === "live";
    }) ?? []
  ).filter(track => !track.label.toLowerCase().includes("screen"));
  const desiredTrackIds = new Set(desiredTracks.map(track => track.id));
  const publishedTracks = Array.from(
    localParticipant.trackPublications.values()
  )
    .map(publication => publication.track?.mediaStreamTrack ?? null)
    .filter((track): track is MediaStreamTrack => Boolean(track));

  for (const publishedTrack of publishedTracks) {
    if (!desiredTrackIds.has(publishedTrack.id)) {
      await localParticipant.unpublishTrack(publishedTrack, false);
    }
  }

  for (const track of desiredTracks) {
    const alreadyPublished = publishedTracks.some(
      publishedTrack => publishedTrack.id === track.id
    );
    if (!alreadyPublished) {
      const source =
        track.kind === "video" ? Track.Source.Camera : Track.Source.Microphone;
      await localParticipant.publishTrack(track, { source });
    }
  }
}

export async function disconnectGroupCallRoom(options: {
  liveKitRoomRef: MutableRef<Room | null>;
  liveKitRoomCallIdRef: MutableRef<string | null>;
  liveKitRoomConnectPromiseRef: MutableRef<Promise<Room | null> | null>;
  clearGroupParticipantMedia: () => void;
}) {
  const currentRoom = options.liveKitRoomRef.current;
  const currentCallId = options.liveKitRoomCallIdRef.current;
  options.liveKitRoomRef.current = null;
  options.liveKitRoomCallIdRef.current = null;
  options.liveKitRoomConnectPromiseRef.current = null;
  options.clearGroupParticipantMedia();

  if (!currentRoom) {
    return;
  }

  try {
    currentRoom.removeAllListeners();
    if (currentRoom.state !== ConnectionState.Disconnected) {
      await currentRoom.disconnect(false);
    }
  } catch (error) {
    log.warn("Failed to disconnect LiveKit room", {
      callId: currentCallId,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

export async function ensureGroupCallRoom(options: {
  session: CallUiSession;
  liveKitRoomRef: MutableRef<Room | null>;
  liveKitRoomCallIdRef: MutableRef<string | null>;
  liveKitRoomConnectPromiseRef: MutableRef<Promise<Room | null> | null>;
  disconnectGroupCallRoom: () => Promise<void>;
  syncGroupRoomLocalTracks: (room: Room) => Promise<void>;
  syncGroupParticipantMedia: (room: Room) => void;
  onActiveSpeakersChanged: (room: Room) => void;
  clearGroupParticipantMedia: () => void;
}) {
  const {
    session,
    liveKitRoomRef,
    liveKitRoomCallIdRef,
    liveKitRoomConnectPromiseRef,
    disconnectGroupCallRoom,
    syncGroupRoomLocalTracks,
    syncGroupParticipantMedia,
    onActiveSpeakersChanged,
    clearGroupParticipantMedia
  } = options;

  if (session.call_scope !== CALL_SCOPE_GROUP) {
    return null;
  }

  const existingRoom = liveKitRoomRef.current;
  if (
    existingRoom &&
    liveKitRoomCallIdRef.current === session.call_id &&
    existingRoom.state !== ConnectionState.Disconnected
  ) {
    await syncGroupRoomLocalTracks(existingRoom);
    syncGroupParticipantMedia(existingRoom);
    return existingRoom;
  }

  if (
    liveKitRoomConnectPromiseRef.current &&
    liveKitRoomCallIdRef.current === session.call_id
  ) {
    return liveKitRoomConnectPromiseRef.current;
  }

  await disconnectGroupCallRoom();
  liveKitRoomCallIdRef.current = session.call_id;

  const connectPromise = (async () => {
    const roomConfig = await fetchCallRoomConfig(session.call_id);
    const nextRoom = new Room({
      adaptiveStream: true,
      dynacast: true
    });

    const handleRoomChange = () => {
      syncGroupParticipantMedia(nextRoom);
    };

    const handleActiveSpeakersChanged = () => {
      // Refresh remote tiles (`is_speaking`) and the local speaking state.
      syncGroupParticipantMedia(nextRoom);
      onActiveSpeakersChanged(nextRoom);
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
      if (liveKitRoomRef.current === nextRoom) {
        liveKitRoomRef.current = null;
        liveKitRoomCallIdRef.current = null;
        clearGroupParticipantMedia();
      }
    });

    await nextRoom.connect(roomConfig.server_url, roomConfig.access_token);
    liveKitRoomRef.current = nextRoom;
    liveKitRoomCallIdRef.current = session.call_id;

    try {
      await nextRoom.startAudio();
    } catch (error) {
      log.warn("LiveKit audio playback requires user interaction", {
        callId: session.call_id,
        error: error instanceof Error ? error.message : String(error)
      });
    }

    await syncGroupRoomLocalTracks(nextRoom);
    syncGroupParticipantMedia(nextRoom);
    return nextRoom;
  })();

  liveKitRoomConnectPromiseRef.current = connectPromise;
  try {
    return await connectPromise;
  } catch (error) {
    liveKitRoomCallIdRef.current = null;
    clearGroupParticipantMedia();
    throw error;
  } finally {
    if (liveKitRoomConnectPromiseRef.current === connectPromise) {
      liveKitRoomConnectPromiseRef.current = null;
    }
  }
}
