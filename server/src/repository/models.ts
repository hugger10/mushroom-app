export interface ConversationRecord {
  id: string;
  type: number;
  name: string;
  avatar_url?: string;
  owner_id?: number;
  description?: string;
  settings?: Record<string, unknown> | string | null;
  status?: number;
  is_deleted: boolean;
  message_seq?: number;
  created_at: Date;
  updated_at: Date;
  peer_id?: number;
  peer_username?: string | null;
  peer_nickname?: string | null;
  last_message_content?: Record<string, unknown> | string | null;
  last_message_time?: Date | string | null;
  last_message_send_id?: number;
  unread_count?: number;
  last_sync_sequence?: number;
  last_read_sequence?: number;
  peer_last_read_sequence?: number;
  last_reaction_sequence?: number;
  tail_loaded_from_seq?: number;
  tail_loaded_to_seq?: number;
  history_complete?: number;
  needs_backfill?: number;
  is_pinned?: boolean | number;
  is_muted?: boolean | number;
  is_archived?: boolean | number;
  draft?: string | null;
}

export interface ConversationMemberRecord {
  conversation_id: string;
  user_id: number;
  joined_at: Date;
  role: number;
  nickname?: string;
  avatar_url?: string;
  join_seq?: number;
  mute_until?: Date | null;
  muted_by?: number | null;
}

export interface ConversationUserStateRecord {
  conversation_id: string;
  user_id: number;
  is_pinned: boolean;
  is_muted: boolean;
  is_archived: boolean;
  draft?: string | null;
  hidden_before_seq?: number;
  last_read_seq: number;
  last_delivered_seq: number;
  unread_count: number;
  peer_id?: number;
  settings?: string | null;
  updated_at: Date;
}

export interface ContactRecord {
  user_id: number;
  contact_user_id?: number;
  username: string;
  nickname: string;
  gender: number;
  avatar_url?: string;
  signature?: string;
  updated_at: Date;
  remark_name?: string | null;
  remark_note?: string | null;
  source?: string | null;
  status?: string;
}

export interface ContactMatchRecord {
  phone_e164: string;
  user_id: number;
  username: string;
  nickname: string;
  avatar_url?: string;
}

export interface UserPrivacySettingsRecord {
  user_id: number;
  discoverable_by_username: 0 | 1 | 2;
  discoverable_by_phone: 0 | 1 | 2;
  message_permission: 0 | 1 | 2;
  presence_visibility: 0 | 1 | 2;
  read_receipts_visibility: 0 | 1 | 2;
  version: number;
  updated_at: Date;
}

export interface UserNotificationSettingsRecord {
  user_id: number;
  messages_enabled: boolean;
  calls_enabled: boolean;
  sound_enabled: boolean;
  group_messages_enabled: boolean;
  mention_only: boolean;
  in_app_banner_enabled: boolean;
  preview_mode: "full" | "sender" | "hidden";
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  quiet_hours_allow_mentions: boolean;
  quiet_hours_allow_calls: boolean;
  updated_at: Date;
}

export interface UserBlockRecord {
  blocker_id: number;
  blocked_id: number;
  created_at: Date;
  username?: string;
  nickname?: string;
  avatar_url?: string;
  gender?: number;
  signature?: string;
}

export interface MessageRecord {
  id: number | string;
  conversation_id: string;
  client_message_id?: string | null;
  reply_to_message_id?: string | null;
  reply_to_sender_id?: number;
  reply_to_sender_nickname?: string;
  reply_to_content?: Record<string, unknown> | string;
  sender_id: number;
  sender_nickname?: string;
  sender_avatar?: string;
  type: number;
  content: Record<string, unknown> | string;
  created_at: Date;
  updated_at: Date;
  sequence: number;
  is_recalled?: boolean;
}

export interface MessageReactionRecord {
  message_id: string;
  conversation_id: string;
  user_id: number;
  emoji: string;
  sequence: number;
  is_deleted: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface MessageOutboxRecord {
  id: number;
  event_type: string;
  message_id?: string | null;
  conversation_id?: string | null;
  target_user_id?: number | null;
  target_device_id?: string | null;
  payload: Record<string, unknown> | string;
  status: number;
  retry_count: number;
  next_retry_at?: Date | null;
  processing_started_at?: Date | null;
  lease_expires_at?: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface AttachmentUploadRecord {
  id: string;
  // node-postgres 默认把 BIGINT 解析为 string 以保留 Snowflake/大整数精度。
  // users.id 实际是小整数（BIGSERIAL 自增），消费方需要时显式 Number(...) 即可。
  uploader_id: string;
  object_name: string;
  original_name: string;
  size: number;
  mime_type?: string | null;
  file_url: string | null;
  status: number;
  bound_message_id?: string | null;
  parent_upload_id?: string | null;
  category: "image" | "video" | "audio" | "voice" | "file";
  upload_mode: "single" | "multipart";
  multipart_upload_id?: string | null;
  width?: number | null;
  height?: number | null;
  duration_ms?: number | null;
  thumb_object_key?: string | null;
  preview_object_key?: string | null;
  thumb_status: "none" | "pending" | "ready" | "failed";
  created_at: Date;
  updated_at: Date;
}

export interface CallSessionRecord {
  id: number;
  call_id: string;
  conversation_id: string;
  call_scope: number;
  media_type: number;
  initiator_user_id: number;
  status: number;
  active_device_count: number;
  participant_count: number;
  started_at: Date;
  answered_at?: Date | null;
  ended_at?: Date | null;
  end_reason?: number | null;
  created_at: Date;
  updated_at: Date;
}

export interface CallParticipantRecord {
  id: number;
  call_id: string;
  conversation_id: string;
  user_id: number;
  device_id: string;
  participant_role: number;
  participant_status: number;
  ringing_at?: Date | null;
  answered_at?: Date | null;
  joined_at?: Date | null;
  left_at?: Date | null;
  end_reason?: number | null;
  created_at: Date;
  updated_at: Date;
}

export interface CallEventRecord {
  id: number;
  call_id: string;
  conversation_id: string;
  event_type: string;
  request_id?: string | null;
  sender_user_id?: number | null;
  sender_device_id?: string | null;
  payload: Record<string, unknown> | string;
  created_at: Date;
}

export interface UserSummaryRecord {
  id: number;
  username: string;
  nickname: string;
  avatar_url?: string;
  gender: number;
  signature?: string;
}

export interface UserRecord {
  id: number;
  username: string;
  password: string;
  email?: string;
  phone?: string;
  avatar_url?: string;
  nickname: string;
  gender: number;
  birthday?: Date;
  signature?: string;
  is_deleted: boolean;
  created_at: Date;
  updated_at: Date;
  last_login_at?: Date;
  status: number;
}

/**
 * Lightweight projection of {@link UserRecord} returned by repositories that
 * only need the public profile fields (no secrets / no audit columns).
 * Used for cross-domain lookups such as conversation/member existence checks.
 */
export type UserProfile = Pick<
  UserRecord,
  "id" | "username" | "nickname" | "avatar_url" | "gender" | "signature"
>;

export interface UserDeviceRecord {
  id: number;
  user_id: number;
  device_id: string;
  device_type: number;
  device_name?: string | null;
  push_provider?: string | null;
  push_token?: string | null;
  voip_token?: string | null;
  push_app_id?: string | null;
  app_version?: string | null;
  last_seen_at: Date;
  last_login_at: Date;
  last_ip?: string | null;
  status: number;
  metadata?: Record<string, unknown> | string | null;
  created_at: Date;
  updated_at: Date;
}

export interface UserSessionRecord {
  id: number;
  session_id: string;
  user_id: number;
  device_id?: string | null;
  refresh_token_hash: string;
  previous_refresh_token_hash?: string | null;
  previous_refresh_rotated_at?: Date | null;
  access_jti?: string | null;
  previous_access_jti?: string | null;
  previous_access_rotated_at?: Date | null;
  issued_at: Date;
  expires_at: Date;
  last_seen_at: Date;
  last_ip?: string | null;
  user_agent?: string | null;
  status: number;
  revoked_at?: Date | null;
  revoke_reason?: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface AuthAuditLogRecord {
  id: number;
  user_id?: number | null;
  device_id?: string | null;
  session_id?: string | null;
  action: string;
  action_status: number;
  ip?: string | null;
  user_agent?: string | null;
  details?: Record<string, unknown> | string | null;
  created_at: Date;
}
