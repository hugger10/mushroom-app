import type { MobileMessageSearchFilter } from "@mushroom/app-core";
import type {
  CallAcceptedMessage,
  CallBusyMessage,
  CallEndedMessage,
  CallInvitedMessage,
  CallMediaType,
  CallParticipant,
  CallParticipationMode,
  CallRejectedMessage,
  CallRingingMessage,
  CallScope,
  CallSession,
  CallStateSyncMessage,
  CallTimeoutMessage
} from "@mushroom/shared";

export type AuthMode = "login" | "register";
export type AuthMethod = "account" | "phone";
export type HomeTab = "chats" | "contacts" | "me";
export type AttachmentTab = "media" | "files";

export type MobileCallPhase =
  | "ringing"
  | "ongoing"
  | "busy"
  | "rejected"
  | "timeout"
  | "ended";

export type MobileCallUiSession = {
  call_id: string;
  conversation_id: string;
  call_scope: CallScope;
  media_type: CallMediaType;
  requested_media_type: CallMediaType;
  direction: "incoming" | "outgoing";
  phase: MobileCallPhase;
  conversation_label: string;
  conversation_avatar_url?: string | null;
  session: CallSession;
  participants: CallParticipant[];
  local_audio_enabled?: boolean;
  local_video_enabled?: boolean;
  local_participation_mode?: CallParticipationMode;
};

/**
 * One remote LiveKit participant's media mirror for the group-call grid. Built
 * from `room.remoteParticipants` and rendered through `RTCView`. Mirrors the
 * desktop `GroupCallParticipantMedia` type (`apps/web/src/types/chat.ts`).
 */
export type MobileGroupCallParticipantMedia = {
  participant_identity: string;
  user_id: number | null;
  device_id: string | null;
  display_name: string;
  /** A `toURL()`-able stream string, or null when no live track is published. */
  stream_url: string | null;
  audio_enabled: boolean;
  video_enabled: boolean;
  is_speaking: boolean;
};

export type CallLifecycleMessage =
  | CallRingingMessage
  | CallAcceptedMessage
  | CallInvitedMessage
  | CallStateSyncMessage
  | CallRejectedMessage
  | CallBusyMessage
  | CallTimeoutMessage
  | CallEndedMessage;

export type CallParticipantUpdateMessage =
  | CallRingingMessage
  | CallAcceptedMessage
  | CallRejectedMessage
  | CallBusyMessage
  | CallTimeoutMessage;

export type SearchFilterOption = {
  key: MobileMessageSearchFilter;
  label: string;
};
