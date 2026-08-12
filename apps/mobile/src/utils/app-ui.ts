import type { MobileRealtimeStatus } from "../services/realtime";
import { i18n } from "../i18n";
import type {
  CallLifecycleMessage,
  CallParticipantUpdateMessage,
  MobileCallUiSession,
  SearchFilterOption
} from "../types/app";
import type {
  CallMediaType,
  CallParticipationMode,
  CallParticipant
} from "@mushroom/shared";
import {
  CALL_MEDIA_TYPE_VIDEO,
  CALL_PARTICIPANT_STATUS_ACCEPTED,
  CALL_PARTICIPANT_STATUS_BUSY,
  CALL_PARTICIPANT_STATUS_DECLINED,
  CALL_PARTICIPANT_STATUS_INVITED,
  CALL_PARTICIPANT_STATUS_JOINED,
  CALL_PARTICIPANT_STATUS_LEFT,
  CALL_PARTICIPANT_STATUS_RINGING,
  CALL_PARTICIPANT_STATUS_SUPERSEDED_BY_SIBLING_DEVICE,
  CALL_PARTICIPANT_STATUS_TIMEOUT,
  formatMessageTime,
  formatChatTimeUnified,
  formatLastActiveTime,
  formatMessageDateLabel,
  isSameLocalDay,
  DEFAULT_MESSAGE_DATE_LABELS
} from "@mushroom/shared";
export type { MessageDateLabels } from "@mushroom/shared";

export {
  formatMessageTime,
  formatChatTimeUnified,
  formatLastActiveTime,
  formatMessageDateLabel,
  isSameLocalDay,
  DEFAULT_MESSAGE_DATE_LABELS
};

export const SEARCH_FILTERS: SearchFilterOption[] = [
  { key: "all", label: "" },
  { key: "text", label: "" },
  { key: "images", label: "" },
  { key: "videos", label: "" },
  { key: "files", label: "" },
  { key: "favorited", label: "" },
  { key: "pinned", label: "" },
  { key: "recalled", label: "" }
];

export function formatDateTime(value?: string | null) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function formatConversationTime(value?: string | null) {
  return formatMessageTime(value);
}

export function statusLabel(status: MobileRealtimeStatus) {
  if (status.status === "reconnecting") {
    return i18n.t("ui.reconnectProgress", {
      attempt: status.attempt,
      maxAttempts: status.maxAttempts
    });
  }

  switch (status.status) {
    case "connected":
      return i18n.t("ui.realtimeConnected");
    case "connecting":
      return i18n.t("ui.realtimeConnecting");
    case "offline":
      return i18n.t("ui.realtimeOffline");
    default:
      return i18n.t("ui.realtimeDisconnected");
  }
}

export function getDeviceTypeLabel(deviceType: number) {
  switch (Number(deviceType)) {
    case 1:
      return i18n.t("ui.deviceType.browser");
    case 2:
      return i18n.t("ui.deviceType.desktop");
    case 3:
      return i18n.t("ui.deviceType.mobile");
    case 9:
      return i18n.t("ui.deviceType.other");
    default:
      return i18n.t("ui.deviceType.unknown");
  }
}

export function getSecurityActionLabel(action: string) {
  switch (action) {
    case "login":
      return i18n.t("ui.securityAction.login");
    case "logout":
      return i18n.t("ui.securityAction.logout");
    case "device_disabled":
      return i18n.t("ui.securityAction.deviceDisabled");
    case "device_restored":
      return i18n.t("ui.securityAction.deviceRestored");
    default:
      return action;
  }
}

export function getGroupRoleLabel(role: number, t: (key: string) => string) {
  switch (Number(role)) {
    case 2:
      return t("groupInfo.owner");
    case 1:
      return t("groupInfo.admin");
    default:
      return t("groupInfo.member");
  }
}

export function createRequestId() {
  return `call:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
}

export function sameUserId(
  left: number | string | null | undefined,
  right: number | string | null | undefined
) {
  return Number(left) === Number(right);
}

export function getCallMediaLabel(mediaType: CallMediaType) {
  return mediaType === CALL_MEDIA_TYPE_VIDEO
    ? i18n.t("ui.callMedia.video")
    : i18n.t("ui.callMedia.voice");
}

export function getCallPhaseLabel(session: MobileCallUiSession) {
  switch (session.phase) {
    case "ringing":
      return session.direction === "incoming"
        ? i18n.t("ui.callPhase.incomingRinging")
        : i18n.t("ui.callPhase.outgoingRinging");
    case "ongoing":
      return i18n.t("ui.callPhase.ongoing");
    case "busy":
      return i18n.t("ui.callPhase.busy");
    case "rejected":
      return i18n.t("ui.callPhase.rejected");
    case "timeout":
      return i18n.t("ui.callPhase.timeout");
    default:
      return i18n.t("ui.callPhase.ended");
  }
}

export function getCallParticipantStatusLabel(status: number) {
  switch (status) {
    case CALL_PARTICIPANT_STATUS_RINGING:
      return i18n.t("ui.callParticipant.ringing");
    case CALL_PARTICIPANT_STATUS_ACCEPTED:
      return i18n.t("ui.callParticipant.accepted");
    case CALL_PARTICIPANT_STATUS_JOINED:
      return i18n.t("ui.callParticipant.joined");
    case CALL_PARTICIPANT_STATUS_DECLINED:
      return i18n.t("ui.callParticipant.declined");
    case CALL_PARTICIPANT_STATUS_BUSY:
      return i18n.t("ui.callParticipant.busy");
    case CALL_PARTICIPANT_STATUS_TIMEOUT:
      return i18n.t("ui.callParticipant.timeout");
    case CALL_PARTICIPANT_STATUS_LEFT:
      return i18n.t("ui.callParticipant.left");
    case CALL_PARTICIPANT_STATUS_SUPERSEDED_BY_SIBLING_DEVICE:
      return i18n.t("ui.callParticipant.superseded");
    case CALL_PARTICIPANT_STATUS_INVITED:
    default:
      return i18n.t("ui.callParticipant.invited");
  }
}

export function getCallParticipationModeLabel(
  mode: CallParticipationMode | null | undefined,
  mediaType: CallMediaType
) {
  switch (mode) {
    case "audio_video":
      return i18n.t("ui.callMode.audioVideo");
    case "audio_only":
      return mediaType === CALL_MEDIA_TYPE_VIDEO
        ? i18n.t("ui.callMode.audioOnlyVideo")
        : i18n.t("ui.callMode.audioOnly");
    case "video_only":
      return i18n.t("ui.callMode.videoOnly");
    case "receive_only":
      return mediaType === CALL_MEDIA_TYPE_VIDEO
        ? i18n.t("ui.callMode.receiveOnlyVideo")
        : i18n.t("ui.callMode.receiveOnlyVoice");
    default:
      return i18n.t("ui.callMode.waiting");
  }
}

export function hasParticipantList(
  payload: CallLifecycleMessage
): payload is Extract<
  CallLifecycleMessage,
  { participants: CallParticipant[] }
> {
  return "participants" in payload;
}

export function hasParticipantUpdate(
  payload: CallLifecycleMessage
): payload is CallParticipantUpdateMessage & { participant: CallParticipant } {
  return "participant" in payload && payload.participant != null;
}
