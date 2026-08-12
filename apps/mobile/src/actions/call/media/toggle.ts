import {
  CALL_SCOPE_GROUP,
  resolveCallParticipationMode,
  type CallMediaStateRequestMessage
} from "@mushroom/shared";
import type { MediaStream } from "@livekit/react-native-webrtc";
import type { Room } from "livekit-client";
import {
  mobileDeviceId,
  mobileRealtimeClient
} from "../../../services/app-runtime";
import { createRequestId } from "../../../utils/app-ui";
import type { MobileAppState } from "../../../app/controller/useMobileAppState";
import { disposeStream } from "./streams";
import { tryAcquireStream } from "./capture";
import type { PermissionActions } from "./types";
import { i18n } from "../../../i18n";

export function createToggleActions(deps: {
  state: MobileAppState;
  permissionActions: PermissionActions;
  replaceLocalCallStream: (stream: MediaStream | null) => void;
  syncGroupRoomLocalTracks: (room: Room) => Promise<void>;
  getLiveKitRoom: () => Room | null;
}) {
  const {
    state,
    permissionActions,
    replaceLocalCallStream,
    syncGroupRoomLocalTracks,
    getLiveKitRoom
  } = deps;

  async function ensureLocalTrack(kind: "audio" | "video") {
    const currentStream = state.localCallStreamRef.current;
    const existingTrack =
      kind === "audio"
        ? currentStream?.getAudioTracks()[0]
        : currentStream?.getVideoTracks()[0];

    if (existingTrack && existingTrack.readyState === "live") {
      existingTrack.enabled = true;
      return;
    }

    const acquired = await tryAcquireStream({
      audio: kind === "audio",
      video: kind === "video"
    });
    if (!acquired) {
      throw new Error(
        kind === "audio"
          ? i18n.t("callActions.cannotEnableMic")
          : i18n.t("callActions.cannotEnableCamera")
      );
    }

    const acquiredTrack =
      kind === "audio"
        ? acquired.getAudioTracks()[0]
        : acquired.getVideoTracks()[0];

    if (!acquiredTrack) {
      disposeStream(acquired, { stopTracks: true });
      throw new Error(
        kind === "audio"
          ? i18n.t("callActions.micUnavailable")
          : i18n.t("callActions.cameraUnavailable")
      );
    }

    if (currentStream) {
      currentStream.addTrack(acquiredTrack);
    }

    const connection = state.peerConnectionRef.current;
    if (connection) {
      const sender = connection
        .getSenders()
        .find(item => item.track?.kind === kind);
      if (sender) {
        await sender.replaceTrack(acquiredTrack);
      } else {
        connection.addTrack(acquiredTrack, currentStream ?? acquired);
      }
    }

    if (currentStream) {
      for (const track of acquired.getTracks()) {
        if (track.id !== acquiredTrack.id) {
          track.stop();
        }
      }
      state.setLocalCallStreamUrl(currentStream.toURL());
      return;
    }

    replaceLocalCallStream(acquired);
  }

  async function toggleLocalCallMedia(kind: "audio" | "video") {
    const session = state.callSessionRef.current;
    if (!session || !state.snapshot?.auth.user) {
      return null;
    }

    const permissionGranted =
      kind === "audio"
        ? await permissionActions.ensureMediaPermission("microphone")
        : await permissionActions.ensureMediaPermission("camera");
    if (!permissionGranted) {
      return null;
    }

    const currentStream = state.localCallStreamRef.current;
    const currentTrack =
      kind === "audio"
        ? currentStream?.getAudioTracks()[0]
        : currentStream?.getVideoTracks()[0];
    const currentEnabled = Boolean(currentTrack?.enabled);

    if (currentTrack && currentTrack.readyState === "live" && currentEnabled) {
      currentTrack.enabled = false;
    } else {
      await ensureLocalTrack(kind);
      const nextTrack =
        kind === "audio"
          ? state.localCallStreamRef.current?.getAudioTracks()[0]
          : state.localCallStreamRef.current?.getVideoTracks()[0];
      if (nextTrack) {
        nextTrack.enabled = true;
      }
    }

    const localAudioEnabled = Boolean(
      state.localCallStreamRef.current
        ?.getAudioTracks()
        .some(track => track.readyState === "live" && track.enabled)
    );
    const localVideoEnabled = Boolean(
      state.localCallStreamRef.current
        ?.getVideoTracks()
        .some(track => track.readyState === "live" && track.enabled)
    );
    const participationMode = resolveCallParticipationMode(
      localAudioEnabled,
      localVideoEnabled
    );

    const payload: CallMediaStateRequestMessage = {
      messageClassify: "call.media-state.request",
      call_id: session.call_id,
      conversation_id: session.conversation_id,
      call_scope: session.call_scope,
      media_type: session.media_type,
      sender_user_id: state.snapshot.auth.user.userId,
      sender_device_id: mobileDeviceId,
      request_id: createRequestId(),
      timestamp: new Date().toISOString(),
      audio_enabled: localAudioEnabled,
      video_enabled: localVideoEnabled,
      participation_mode: participationMode
    };

    await mobileRealtimeClient.sendMessage(payload);

    // For group calls, reflect the mute/camera change to the LiveKit SFU by
    // (un)publishing local tracks. 1:1 calls renegotiate via the existing
    // sender.replaceTrack path inside `ensureLocalTrack`.
    if (session.call_scope === CALL_SCOPE_GROUP) {
      const room = getLiveKitRoom();
      if (room) {
        try {
          await syncGroupRoomLocalTracks(room);
        } catch {
          // Track sync failures are non-fatal; the media-state broadcast above
          // already informs peers of the intended state.
        }
      }
    }

    return {
      localAudioEnabled,
      localVideoEnabled,
      localParticipationMode: participationMode
    };
  }

  return { ensureLocalTrack, toggleLocalCallMedia };
}
