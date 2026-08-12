import type {
  CallMediaType,
  CallParticipant,
  CallParticipationMode,
  CallScope,
  CallSession,
  Conversation,
  ConversationMember,
  Message
} from "@mushroom/shared";

export type {
  CallMediaType,
  CallParticipant,
  CallParticipationMode,
  CallScope,
  CallSession,
  Conversation,
  ConversationMember,
  Message
};

export type SearchMessageResult = Message & {
  conversation_label?: string;
};

export interface CallUiSession {
  call_id: string;
  conversation_id: string;
  call_scope: CallScope;
  media_type: CallMediaType;
  requested_media_type: CallMediaType;
  direction: "incoming" | "outgoing";
  phase: "ringing" | "ongoing" | "busy" | "rejected" | "timeout" | "ended";
  conversation_label: string;
  session: CallSession;
  participants: CallParticipant[];
  local_audio_enabled?: boolean;
  local_video_enabled?: boolean;
  local_participation_mode?: CallParticipationMode;
}

export interface GroupCallParticipantMedia {
  participant_identity: string;
  user_id: number | null;
  device_id: string | null;
  display_name: string;
  stream: MediaStream | null;
  audio_enabled: boolean;
  video_enabled: boolean;
  is_speaking: boolean;
}
