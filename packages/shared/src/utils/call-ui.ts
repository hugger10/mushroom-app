import {
  CALL_MEDIA_TYPE_AUDIO,
  CALL_MEDIA_TYPE_VIDEO,
  CALL_SCOPE_DIRECT,
  CALL_STATUS_ENDED,
  CALL_STATUS_ONGOING
} from "../types/call";
import type {
  CallMediaType,
  CallParticipationMode,
  CallScope
} from "../types/call";
import type {
  CallAcceptedMessage,
  CallBusyMessage,
  CallEndedMessage,
  CallInvitedMessage,
  CallRingingMessage,
  CallRejectedMessage,
  CallStateSyncMessage,
  CallTimeoutMessage
} from "../types/ws";

export type CallUiPhase =
  | "ringing"
  | "ongoing"
  | "busy"
  | "rejected"
  | "timeout"
  | "ended";

export interface CallMediaPreparationPlan {
  effectiveMediaType: CallMediaType;
  localParticipationMode: CallParticipationMode;
  notice?: string;
  errorMessage?: string;
}

export function shouldAutoDismissCallSessionForPhase(phase: CallUiPhase) {
  return phase === "rejected" || phase === "timeout" || phase === "ended";
}

export function shouldDismissCallSessionAfterMessage(
  message:
    | CallAcceptedMessage
    | CallInvitedMessage
    | CallRingingMessage
    | CallStateSyncMessage
    | CallRejectedMessage
    | CallBusyMessage
    | CallTimeoutMessage
    | CallEndedMessage
) {
  switch (message.messageClassify) {
    case "call.rejected":
    case "call.timeout":
      return true;
    case "call.ended":
      return message.session.status === CALL_STATUS_ENDED;
    case "call.busy":
      return message.session.status === CALL_STATUS_ENDED;
    default:
      return false;
  }
}

export function getCallPhaseFromMessage(
  message:
    | CallAcceptedMessage
    | CallInvitedMessage
    | CallRingingMessage
    | CallStateSyncMessage
    | CallRejectedMessage
    | CallBusyMessage
    | CallTimeoutMessage
    | CallEndedMessage
): CallUiPhase {
  if (message.messageClassify === "call.busy") {
    return "busy";
  }
  if (message.messageClassify === "call.rejected") {
    return "rejected";
  }
  if (message.messageClassify === "call.timeout") {
    return "timeout";
  }
  if (message.messageClassify === "call.ended") {
    return message.session.status === CALL_STATUS_ENDED ? "ended" : "ongoing";
  }
  if (message.session.status === CALL_STATUS_ONGOING) {
    return "ongoing";
  }
  if (message.session.status === CALL_STATUS_ENDED) {
    return "ended";
  }
  return "ringing";
}

export function buildCallMediaPreparationNotice(
  requestedMediaType: CallMediaType,
  effectiveMediaType: CallMediaType,
  localAudioEnabled: boolean,
  localVideoEnabled: boolean,
  context: "start" | "accept"
) {
  const actionLabel = context === "accept" ? "接听" : "发起";

  if (
    requestedMediaType === CALL_MEDIA_TYPE_VIDEO &&
    effectiveMediaType !== CALL_MEDIA_TYPE_VIDEO
  ) {
    if (localAudioEnabled) {
      return `当前摄像头不可用，将改为语音通话${actionLabel}`;
    }
    return "当前摄像头和麦克风不可用，将以只听模式进入语音通话";
  }

  if (
    requestedMediaType === CALL_MEDIA_TYPE_VIDEO &&
    effectiveMediaType === CALL_MEDIA_TYPE_VIDEO &&
    localAudioEnabled &&
    !localVideoEnabled
  ) {
    return "当前摄像头不可用，将以纯语音方式加入视频通话";
  }

  if (requestedMediaType === CALL_MEDIA_TYPE_VIDEO && !localAudioEnabled) {
    if (!localVideoEnabled) {
      return "当前麦克风和摄像头不可用，将以只听模式加入当前视频通话";
    }
    if (localVideoEnabled) {
      return `当前麦克风不可用，将以只看不说模式${actionLabel}视频通话`;
    }
    return "当前麦克风不可用，将以只听模式加入当前通话";
  }

  if (
    requestedMediaType !== CALL_MEDIA_TYPE_VIDEO &&
    !localAudioEnabled &&
    !localVideoEnabled
  ) {
    return `当前麦克风不可用，将以只听模式${actionLabel}语音通话`;
  }

  return undefined;
}

export function resolveCallMediaPreparationPlan(options: {
  requestedMediaType: CallMediaType;
  context: "start" | "accept";
  localAudioEnabled: boolean;
  localVideoEnabled: boolean;
}): CallMediaPreparationPlan {
  const { requestedMediaType, context, localAudioEnabled, localVideoEnabled } =
    options;

  let effectiveMediaType = requestedMediaType;
  let errorMessage: string | undefined;

  if (context === "start") {
    if (requestedMediaType === CALL_MEDIA_TYPE_AUDIO && !localAudioEnabled) {
      errorMessage = "当前未检测到可用麦克风，无法发起语音通话";
    }

    if (requestedMediaType === CALL_MEDIA_TYPE_VIDEO) {
      if (!localVideoEnabled && localAudioEnabled) {
        effectiveMediaType = CALL_MEDIA_TYPE_AUDIO;
      } else if (!localVideoEnabled && !localAudioEnabled) {
        errorMessage = "当前未检测到可用麦克风或摄像头，无法发起视频通话";
      }
    }
  } else if (
    requestedMediaType === CALL_MEDIA_TYPE_VIDEO &&
    !localVideoEnabled
  ) {
    effectiveMediaType = CALL_MEDIA_TYPE_AUDIO;
  }

  return {
    effectiveMediaType,
    localParticipationMode: resolveCallParticipationMode(
      localAudioEnabled,
      localVideoEnabled
    ),
    notice: errorMessage
      ? undefined
      : buildCallMediaPreparationNotice(
          requestedMediaType,
          effectiveMediaType,
          localAudioEnabled,
          localVideoEnabled,
          context
        ),
    errorMessage
  };
}

export function resolveCallParticipationMode(
  localAudioEnabled: boolean,
  localVideoEnabled: boolean
): CallParticipationMode {
  if (localAudioEnabled && localVideoEnabled) {
    return "audio_video";
  }
  if (localAudioEnabled) {
    return "audio_only";
  }
  if (localVideoEnabled) {
    return "video_only";
  }
  return "receive_only";
}

export function shouldLocalUserCreateCallOffer(options: {
  callScope: CallScope;
  initiatorUserId: number;
  localUserId: number | null | undefined;
}) {
  return (
    options.callScope === CALL_SCOPE_DIRECT &&
    options.localUserId != null &&
    Number(options.initiatorUserId) === Number(options.localUserId)
  );
}
