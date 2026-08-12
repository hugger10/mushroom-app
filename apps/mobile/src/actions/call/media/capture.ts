import {
  CALL_MEDIA_TYPE_VIDEO,
  resolveCallMediaPreparationPlan,
  type CallMediaType
} from "@mushroom/shared";
import { MediaStream, mediaDevices } from "@livekit/react-native-webrtc";
import { disposeStream } from "./streams";
import type { PermissionActions, PreparedLocalCallMedia } from "./types";

export async function tryAcquireStream(options: {
  audio: boolean;
  video: boolean;
}) {
  try {
    return await mediaDevices.getUserMedia({
      audio: options.audio,
      video: options.video ? { facingMode: "user" } : false
    });
  } catch {
    if (!options.video) {
      return null;
    }

    try {
      return await mediaDevices.getUserMedia({
        audio: options.audio,
        video: true
      });
    } catch {
      return null;
    }
  }
}

export function createPrepareLocalCallMedia(deps: {
  permissionActions: PermissionActions;
  replaceLocalCallStream: (stream: MediaStream | null) => void;
}) {
  const { permissionActions, replaceLocalCallStream } = deps;

  return async function prepareLocalCallMedia(options: {
    requestedMediaType: CallMediaType;
    context: "start" | "accept";
  }): Promise<PreparedLocalCallMedia> {
    await permissionActions.resolveCallLocalMediaCapability(options);
    replaceLocalCallStream(null);

    let stream: MediaStream | null = null;
    let localAudioEnabled = false;
    let localVideoEnabled = false;

    if (options.requestedMediaType === CALL_MEDIA_TYPE_VIDEO) {
      stream = await tryAcquireStream({ audio: true, video: true });
      localAudioEnabled = Boolean(stream?.getAudioTracks().length);
      localVideoEnabled = Boolean(stream?.getVideoTracks().length);

      if (!stream) {
        stream = await tryAcquireStream({ audio: true, video: false });
        localAudioEnabled = Boolean(stream?.getAudioTracks().length);
        localVideoEnabled = false;
      }

      if (!stream) {
        stream = await tryAcquireStream({ audio: false, video: true });
        localAudioEnabled = false;
        localVideoEnabled = Boolean(stream?.getVideoTracks().length);
      }
    } else {
      stream = await tryAcquireStream({ audio: true, video: false });
      localAudioEnabled = Boolean(stream?.getAudioTracks().length);
      localVideoEnabled = false;
    }

    const preparationPlan = resolveCallMediaPreparationPlan({
      requestedMediaType: options.requestedMediaType,
      context: options.context,
      localAudioEnabled,
      localVideoEnabled
    });

    if (preparationPlan.errorMessage) {
      disposeStream(stream, { stopTracks: true });
      throw new Error(preparationPlan.errorMessage);
    }

    replaceLocalCallStream(stream);

    return {
      effectiveMediaType: preparationPlan.effectiveMediaType,
      localAudioEnabled,
      localVideoEnabled,
      localParticipationMode: preparationPlan.localParticipationMode,
      stream,
      notice: preparationPlan.notice
    };
  };
}
