import {
  CALL_MEDIA_TYPE_AUDIO,
  resolveCallMediaPreparationPlan,
  type CallMediaType
} from "@mushroom/shared";
import type { CallUiSession } from "../../types/chat";
import { stopMediaStream } from "../useChatHelpers";
import { i18n } from "../../i18n";

export type PreparedLocalCallMedia = {
  effectiveMediaType: CallMediaType;
  localAudioEnabled: boolean;
  localVideoEnabled: boolean;
  localParticipationMode: CallUiSession["local_participation_mode"];
  stream: MediaStream | null;
  notice?: string;
};

export async function resolveAvailableInputDevices() {
  if (
    typeof navigator === "undefined" ||
    !navigator.mediaDevices ||
    !navigator.mediaDevices.enumerateDevices
  ) {
    return {
      hasAudioInput: true,
      hasVideoInput: true
    };
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return {
      hasAudioInput: devices.some(device => device.kind === "audioinput"),
      hasVideoInput: devices.some(device => device.kind === "videoinput")
    };
  } catch {
    return {
      hasAudioInput: true,
      hasVideoInput: true
    };
  }
}

export function resolveCallMediaPermissionError(options: {
  requestedMediaType: CallMediaType;
  hasAudioInput: boolean;
  hasVideoInput: boolean;
}) {
  const { requestedMediaType, hasAudioInput, hasVideoInput } = options;
  if (requestedMediaType === CALL_MEDIA_TYPE_AUDIO) {
    return hasAudioInput
      ? i18n.t("callActions.micPermissionNeeded")
      : i18n.t("callActions.noMicDetectedVoice");
  }

  if (hasAudioInput && hasVideoInput) {
    return i18n.t("callActions.micCameraPermissionNeeded");
  }
  if (hasAudioInput) {
    return i18n.t("callActions.micPermissionNeeded");
  }
  if (hasVideoInput) {
    return i18n.t("callActions.cameraPermissionNeeded");
  }
  return i18n.t("callActions.noMicCamDetectedVideo");
}

async function tryAcquireStream(constraints: MediaStreamConstraints) {
  try {
    return await navigator.mediaDevices.getUserMedia(constraints);
  } catch {
    return null;
  }
}

export async function prepareLocalCallMedia(options: {
  requestedMediaType: CallMediaType;
  context: "start" | "accept";
}): Promise<PreparedLocalCallMedia> {
  if (
    typeof navigator === "undefined" ||
    !navigator.mediaDevices ||
    !navigator.mediaDevices.getUserMedia
  ) {
    throw new Error(i18n.t("callActions.deviceAccessUnsupported"));
  }

  const { hasAudioInput, hasVideoInput } = await resolveAvailableInputDevices();
  let stream: MediaStream | null = null;
  let localAudioEnabled = false;
  let localVideoEnabled = false;

  if (options.requestedMediaType === CALL_MEDIA_TYPE_AUDIO) {
    if (hasAudioInput) {
      stream = await tryAcquireStream({ audio: true, video: false });
    }
    localAudioEnabled = Boolean(stream?.getAudioTracks().length);
  } else {
    if (hasAudioInput && hasVideoInput) {
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
    } else if (hasAudioInput) {
      stream = await tryAcquireStream({ audio: true, video: false });
      localAudioEnabled = Boolean(stream?.getAudioTracks().length);
    } else if (hasVideoInput) {
      stream = await tryAcquireStream({ audio: false, video: true });
      localVideoEnabled = Boolean(stream?.getVideoTracks().length);
    }
  }

  if (!stream) {
    localAudioEnabled = false;
    localVideoEnabled = false;
  }

  const preparationPlan = resolveCallMediaPreparationPlan({
    requestedMediaType: options.requestedMediaType,
    context: options.context,
    localAudioEnabled,
    localVideoEnabled
  });

  if (preparationPlan.errorMessage) {
    stopMediaStream(stream);
    throw new Error(
      options.context === "start"
        ? resolveCallMediaPermissionError({
            requestedMediaType: options.requestedMediaType,
            hasAudioInput,
            hasVideoInput
          })
        : preparationPlan.errorMessage
    );
  }

  return {
    effectiveMediaType: preparationPlan.effectiveMediaType,
    localAudioEnabled,
    localVideoEnabled,
    localParticipationMode: preparationPlan.localParticipationMode,
    stream,
    notice: preparationPlan.notice
  };
}
