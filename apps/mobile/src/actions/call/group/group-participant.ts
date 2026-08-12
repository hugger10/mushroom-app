import {
  MediaStream,
  type MediaStreamTrack
} from "@livekit/react-native-webrtc";
import type { RemoteParticipant } from "livekit-client";

/**
 * Parsed `user_id` / `device_id` extracted from a LiveKit participant's
 * identity or metadata. Mirrors the desktop helper in
 * `apps/web/src/hooks/call/callParticipant.ts` so both platforms agree on the
 * `${callId}:${userId}:${deviceId}` identity scheme minted by
 * `server/src/service/call_room_service.ts`.
 */
export type ParsedLiveKitParticipant = {
  userId: number | null;
  deviceId: string | null;
};

export function parseLiveKitParticipantIdentity(
  identity: string | null | undefined
): ParsedLiveKitParticipant {
  if (!identity) {
    return {
      userId: null,
      deviceId: null
    };
  }

  const parts = identity.split(":");
  if (parts.length < 3) {
    return {
      userId: null,
      deviceId: null
    };
  }

  const parsedUserId = Number(parts[parts.length - 2]);
  return {
    userId: Number.isFinite(parsedUserId) ? parsedUserId : null,
    deviceId: parts[parts.length - 1] || null
  };
}

export function parseLiveKitParticipantMetadata(
  metadata: string | null | undefined
): ParsedLiveKitParticipant {
  if (!metadata) {
    return {
      userId: null,
      deviceId: null
    };
  }

  try {
    const parsed = JSON.parse(metadata) as Record<string, unknown>;
    const parsedUserId = Number(parsed.user_id);
    const parsedDeviceId =
      typeof parsed.device_id === "string" ? parsed.device_id : null;
    return {
      userId: Number.isFinite(parsedUserId) ? parsedUserId : null,
      deviceId: parsedDeviceId
    };
  } catch {
    return {
      userId: null,
      deviceId: null
    };
  }
}

/**
 * Build a single `MediaStream` aggregating all live tracks published by a
 * remote LiveKit participant, so it can be rendered through `RTCView` exactly
 * like the 1:1 remote stream. Returns `null` when the participant has no live
 * track yet.
 */
export function buildLiveKitParticipantStream(
  participant: RemoteParticipant
): MediaStream | null {
  const tracks = Array.from(participant.trackPublications.values()).reduce<
    MediaStreamTrack[]
  >((result, publication) => {
    const mediaTrack = publication.track?.mediaStreamTrack as unknown as
      | MediaStreamTrack
      | undefined;
    if (
      mediaTrack &&
      mediaTrack.readyState === "live" &&
      !result.some(track => track.id === mediaTrack.id)
    ) {
      result.push(mediaTrack);
    }
    return result;
  }, []);

  return tracks.length > 0 ? new MediaStream(tracks) : null;
}
