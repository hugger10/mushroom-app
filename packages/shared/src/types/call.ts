export const CALL_SCOPE_DIRECT = 1;
export const CALL_SCOPE_GROUP = 2;

export const CALL_MEDIA_TYPE_AUDIO = 1;
export const CALL_MEDIA_TYPE_VIDEO = 2;

export const CALL_STATUS_INITIATED = 1;
export const CALL_STATUS_RINGING = 2;
export const CALL_STATUS_ONGOING = 3;
export const CALL_STATUS_ENDED = 4;
export const CALL_STATUS_CANCELLED = 5;
export const CALL_STATUS_TIMEOUT = 6;
export const CALL_STATUS_FAILED = 7;

export const CALL_END_REASON_COMPLETED = 1;
export const CALL_END_REASON_CANCELLED_BY_INITIATOR = 2;
export const CALL_END_REASON_REJECTED = 3;
export const CALL_END_REASON_BUSY = 4;
export const CALL_END_REASON_TIMEOUT = 5;
export const CALL_END_REASON_NETWORK_FAILURE = 6;
export const CALL_END_REASON_FORCE_CLOSED = 7;

export const CALL_PARTICIPANT_ROLE_INITIATOR = 1;
export const CALL_PARTICIPANT_ROLE_INVITEE = 2;

export const CALL_PARTICIPANT_STATUS_INVITED = 1;
export const CALL_PARTICIPANT_STATUS_RINGING = 2;
export const CALL_PARTICIPANT_STATUS_ACCEPTED = 3;
export const CALL_PARTICIPANT_STATUS_JOINED = 4;
export const CALL_PARTICIPANT_STATUS_DECLINED = 5;
export const CALL_PARTICIPANT_STATUS_BUSY = 6;
export const CALL_PARTICIPANT_STATUS_TIMEOUT = 7;
export const CALL_PARTICIPANT_STATUS_LEFT = 8;
export const CALL_PARTICIPANT_STATUS_SUPERSEDED_BY_SIBLING_DEVICE = 9;

export type CallScope = typeof CALL_SCOPE_DIRECT | typeof CALL_SCOPE_GROUP;

export type CallMediaType =
  | typeof CALL_MEDIA_TYPE_AUDIO
  | typeof CALL_MEDIA_TYPE_VIDEO;

export type CallParticipationMode =
  | "audio_video"
  | "audio_only"
  | "video_only"
  | "receive_only";

export type CallStatus =
  | typeof CALL_STATUS_INITIATED
  | typeof CALL_STATUS_RINGING
  | typeof CALL_STATUS_ONGOING
  | typeof CALL_STATUS_ENDED
  | typeof CALL_STATUS_CANCELLED
  | typeof CALL_STATUS_TIMEOUT
  | typeof CALL_STATUS_FAILED;

export type CallEndReason =
  | typeof CALL_END_REASON_COMPLETED
  | typeof CALL_END_REASON_CANCELLED_BY_INITIATOR
  | typeof CALL_END_REASON_REJECTED
  | typeof CALL_END_REASON_BUSY
  | typeof CALL_END_REASON_TIMEOUT
  | typeof CALL_END_REASON_NETWORK_FAILURE
  | typeof CALL_END_REASON_FORCE_CLOSED;

export type CallParticipantRole =
  | typeof CALL_PARTICIPANT_ROLE_INITIATOR
  | typeof CALL_PARTICIPANT_ROLE_INVITEE;

export type CallParticipantStatus =
  | typeof CALL_PARTICIPANT_STATUS_INVITED
  | typeof CALL_PARTICIPANT_STATUS_RINGING
  | typeof CALL_PARTICIPANT_STATUS_ACCEPTED
  | typeof CALL_PARTICIPANT_STATUS_JOINED
  | typeof CALL_PARTICIPANT_STATUS_DECLINED
  | typeof CALL_PARTICIPANT_STATUS_BUSY
  | typeof CALL_PARTICIPANT_STATUS_TIMEOUT
  | typeof CALL_PARTICIPANT_STATUS_LEFT
  | typeof CALL_PARTICIPANT_STATUS_SUPERSEDED_BY_SIBLING_DEVICE;

export interface CallSession {
  call_id: string;
  conversation_id: string;
  call_scope: CallScope;
  media_type: CallMediaType;
  initiator_user_id: number;
  status: CallStatus;
  active_device_count: number;
  participant_count: number;
  started_at: string;
  answered_at?: string | null;
  ended_at?: string | null;
  end_reason?: CallEndReason | null;
  created_at: string;
  updated_at: string;
}

export interface CallParticipant {
  call_id: string;
  conversation_id: string;
  user_id: number;
  device_id: string;
  participant_role: CallParticipantRole;
  participant_status: CallParticipantStatus;
  ringing_at?: string | null;
  answered_at?: string | null;
  joined_at?: string | null;
  left_at?: string | null;
  end_reason?: CallEndReason | null;
  audio_enabled?: boolean | null;
  video_enabled?: boolean | null;
  participation_mode?: CallParticipationMode | null;
  created_at: string;
  updated_at: string;
}

export interface CallRecordMessageContent {
  type: "call_record";
  call_id: string;
  scope: "direct" | "group";
  media_type: "audio" | "video";
  initiator_user_id: number;
  outcome:
    | "completed"
    | "cancelled"
    | "rejected"
    | "busy"
    | "timeout"
    | "failed";
  duration_seconds: number;
  started_at: string;
  ended_at: string;
  summary?: {
    joined_count?: number;
    declined_count?: number;
    busy_count?: number;
    timeout_count?: number;
  };
}

export interface VoiceMessageContent {
  type: "voice_message";
  url: string;
  duration_seconds: number;
  mime_type: string;
  size: number;
  waveform?: number[];
}
