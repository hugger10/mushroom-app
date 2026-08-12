import {
  CALL_PARTICIPANT_STATUS_ACCEPTED,
  CALL_PARTICIPANT_STATUS_JOINED,
  type CallParticipant
} from "@mushroom/shared";
import type { MobileCallUiSession } from "../../../../types/app";
import { i18n } from "../../../../i18n";

export function getCallPhaseLabel(callSession: MobileCallUiSession) {
  switch (callSession.phase) {
    case "ringing":
      return callSession.direction === "incoming"
        ? i18n.t("ui.callStatus.incoming")
        : i18n.t("ui.callStatus.waiting");
    case "ongoing":
      return "00:00";
    case "busy":
      return i18n.t("ui.callStatus.busy");
    case "rejected":
      return i18n.t("ui.callStatus.rejected");
    case "timeout":
      return i18n.t("ui.callStatus.timeout");
    default:
      return i18n.t("ui.callStatus.ended");
  }
}

export function formatCallDuration(totalSeconds: number) {
  const normalizedSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(normalizedSeconds / 60);
  const seconds = normalizedSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(
    2,
    "0"
  )}`;
}

export function getParticipantInitial(participant: CallParticipant) {
  return String(participant.user_id || "?").slice(-2);
}

export function getParticipantStatusLabel(participant: CallParticipant) {
  if (participant.participant_status === CALL_PARTICIPANT_STATUS_JOINED) {
    return i18n.t("ui.callStatus.participantJoined");
  }
  if (participant.participant_status === CALL_PARTICIPANT_STATUS_ACCEPTED) {
    return i18n.t("ui.callStatus.participantAccepted");
  }
  return i18n.t("ui.callStatus.participantWaiting");
}
