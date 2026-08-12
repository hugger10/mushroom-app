import {
  CALL_MEDIA_TYPE_VIDEO,
  resolveCallMediaPreparationPlan,
  resolveCallParticipationMode,
  type CallMediaType
} from "@mushroom/shared";
import { RESULTS } from "react-native-permissions";
import { i18n } from "../../i18n";
import {
  getBlockedErrorMessage,
  getDeniedErrorMessage,
  getUnavailableErrorMessage,
  resolveMediaPermission,
  type MediaPermissionKind
} from "../../platform/media-permissions";

export function createCallPermissionActions() {
  async function ensureMediaPermission(kind: MediaPermissionKind) {
    const result = await resolveMediaPermission(kind);
    return result.granted;
  }

  async function resolveCallLocalMediaCapability(options: {
    requestedMediaType: CallMediaType;
    context: "start" | "accept";
  }) {
    const microphone = await resolveMediaPermission("microphone");
    const camera =
      options.requestedMediaType === CALL_MEDIA_TYPE_VIDEO
        ? await resolveMediaPermission("camera")
        : {
            granted: false,
            permission: null,
            status: "unavailable" as const
          };

    if (
      options.requestedMediaType !== CALL_MEDIA_TYPE_VIDEO &&
      !microphone.granted
    ) {
      if (microphone.status === RESULTS.BLOCKED) {
        throw new Error(
          getBlockedErrorMessage(
            "microphone",
            i18n.t("permissions.verbStartVoiceCall")
          )
        );
      }
      if (microphone.status === RESULTS.UNAVAILABLE) {
        throw new Error(
          getUnavailableErrorMessage(
            "microphone",
            i18n.t("permissions.verbStartVoiceCall")
          )
        );
      }
      throw new Error(
        getDeniedErrorMessage(
          "microphone",
          i18n.t("permissions.verbStartVoiceCall")
        )
      );
    }

    if (
      options.requestedMediaType === CALL_MEDIA_TYPE_VIDEO &&
      !microphone.granted &&
      !camera.granted &&
      options.context === "start"
    ) {
      if (
        microphone.status === RESULTS.BLOCKED ||
        camera.status === RESULTS.BLOCKED
      ) {
        throw new Error(i18n.t("permissions.videoBlocked"));
      }
      if (
        microphone.status === RESULTS.UNAVAILABLE ||
        camera.status === RESULTS.UNAVAILABLE
      ) {
        throw new Error(i18n.t("permissions.videoUnavailable"));
      }
      throw new Error(i18n.t("callActions.videoCallPermissionDenied"));
    }

    const localAudioEnabled = microphone.granted;
    const localVideoEnabled =
      options.requestedMediaType === CALL_MEDIA_TYPE_VIDEO && camera.granted;

    const preparationPlan = resolveCallMediaPreparationPlan({
      requestedMediaType: options.requestedMediaType,
      context: options.context,
      localAudioEnabled,
      localVideoEnabled
    });

    if (preparationPlan.errorMessage) {
      throw new Error(preparationPlan.errorMessage);
    }

    return {
      effectiveMediaType: preparationPlan.effectiveMediaType,
      localAudioEnabled,
      localVideoEnabled,
      localParticipationMode: resolveCallParticipationMode(
        localAudioEnabled,
        localVideoEnabled
      ),
      notice: preparationPlan.notice
    };
  }

  return {
    ensureMediaPermission,
    resolveCallLocalMediaCapability
  };
}
