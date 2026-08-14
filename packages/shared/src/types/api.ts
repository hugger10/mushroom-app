import type { CallParticipant, CallSession } from "./call";
import type {
  Contact,
  ContactListItem,
  Conversation,
  ConversationMember,
  LoginUser,
  MessageReplyReference,
  NotificationPreviewMode,
  PrivacyRule,
  UserBlock
} from "./models";

export type {
  UserNotificationSettings,
  UserPrivacySettings,
  UserPrivacySettingsEnvelope
} from "./models";

export type ApiResult<T> = {
  code: number;
  success: boolean;
  message?: string | null;
  timestamp: number;
  data: T;
};

export interface LoginRequest {
  username: string;
  password: string;
  device?: DeviceRegistrationPayload;
}

export interface DeviceRegistrationPayload {
  device_id: string;
  device_type?: number;
  device_name?: string;
  app_version?: string;
  push_provider?: "jpush" | "fcm" | "huawei" | "xiaomi";
  push_token?: string;
  /**
   * iOS PushKit VoIP token. Registered alongside the regular FCM/APNs token so
   * the server can deliver `call.invite` over the dedicated APNs VoIP channel
   * (which reliably wakes a killed/background app to show CallKit). Independent
   * of `push_provider`/`push_token`, which keep serving chat-message pushes.
   */
  voip_token?: string;
  push_app_id?: string;
  push_capabilities?: string[];
  metadata?: Record<string, unknown>;
}

export interface RegisterCurrentDeviceRequest {
  device: DeviceRegistrationPayload;
}

export interface RegisterCurrentDeviceResponse {
  device_id: string;
  push_provider?: "jpush" | "fcm" | "huawei" | "xiaomi" | null;
  push_token?: string | null;
  voip_token?: string | null;
  push_app_id?: string | null;
  push_capabilities?: string[] | null;
  updated: boolean;
}

export interface RegisterRequest {
  username: string;
  password: string;
  nickname?: string;
}

export interface LoginResponse {
  token: string;
  access_token: string;
  refresh_token: string;
  expires_in: number;
  refresh_expires_in: number;
}

export interface RefreshTokenRequest {
  refresh_token: string;
}

export interface ChangePasswordRequest {
  current_password: string;
  new_password: string;
}

export interface ChangePasswordResponse {
  updated: boolean;
  revoked_count: number;
}

export interface UpdateDeviceStatusRequest {
  device_id: string;
}

export interface UpdateDeviceStatusResponse {
  updated: boolean;
  target_device_id: string;
  status: number;
  current_device_id?: string | null;
}

export interface UserPresenceSummary {
  is_online: boolean;
  active_device_count: number;
  last_active_at?: string;
  /**
   * 服务端测得该 presence 数据时的时间戳（ISO）。
   * 客户端合并时按 observed_at 大小取最新者，避免并发请求乱序导致的 is_online 闪烁。
   * 老版本服务端不会返回该字段；老版本客户端读不到也不影响（向后兼容）。
   */
  observed_at?: string;
}

export interface UserPresenceEntry extends UserPresenceSummary {
  user_id: number;
}

export interface UserManagedDevice {
  device_id: string;
  device_type: number;
  device_name?: string | null;
  push_provider?: "jpush" | "fcm" | "huawei" | "xiaomi" | null;
  push_token?: string | null;
  push_app_id?: string | null;
  push_capabilities?: string[] | null;
  app_version?: string | null;
  last_seen_at?: string | null;
  last_login_at?: string | null;
  last_ip?: string | null;
  status: number;
  metadata?: Record<string, unknown> | null;
  is_current_device: boolean;
  is_online: boolean;
  active_session_count: number;
}

export interface UserDevicesResponse {
  current_device_id?: string | null;
  devices: UserManagedDevice[];
}

export interface LogoutDeviceRequest {
  device_id: string;
}

export interface LogoutAllDevicesRequest {
  keep_current?: number;
}

export interface LogoutDevicesResponse {
  revoked_count: number;
  current_device_id?: string | null;
}

export interface UserSecurityEvent {
  id: number;
  action: string;
  action_status: number;
  device_id?: string | null;
  session_id?: string | null;
  ip?: string | null;
  user_agent?: string | null;
  details?: Record<string, unknown> | null;
  created_at: string;
}

export interface UserSecurityEventsResponse {
  events: UserSecurityEvent[];
}

export interface CallIceServerConfig {
  urls: string[];
  username?: string;
  credential?: string;
}

export interface CallIceConfigResponse {
  issued_at: string;
  ttl_seconds: number;
  ice_servers: CallIceServerConfig[];
}

export interface CallRoomConfigResponse {
  provider: "livekit";
  issued_at: string;
  ttl_seconds: number;
  server_url: string;
  room_name: string;
  access_token: string;
  participant_identity: string;
  participant_name: string;
  max_participants: number;
  metadata: Record<string, unknown>;
}

export interface CallStateResponse {
  session: CallSession;
  participants: CallParticipant[];
}

export interface UserProfile {
  id: number;
  username: string;
  nickname: string;
  avatar_url?: string;
  email?: string;
  phone?: string;
  gender: number;
  birthday?: string;
  signature?: string;
}

export interface UpdateUserProfileRequest {
  nickname?: string;
  avatar_url?: string;
  email?: string;
  phone?: string;
  gender?: number;
  birthday?: string;
  signature?: string;
}

export interface UserSessionSummary extends UserPresenceSummary {
  last_login_at?: string;
}

export interface UserSearchResult {
  user_id: number;
  username: string;
  nickname: string;
  avatar_url?: string;
  can_open_direct?: boolean;
  is_already_contact?: boolean;
}

export interface LookupContactByPhoneRequest {
  phone_e164: string;
  /**
   * Optional default country calling code (e.g. "+86") used by the server to
   * normalize national-format phone numbers when the input lacks an explicit
   * country code prefix.
   */
  default_country_code?: string;
}

export interface LookupContactByPhoneResponse {
  matched: boolean;
  user?: UserSearchResult | null;
  /**
   * Server-normalized phone number. When `matched` is false the client can
   * use this value to compose an invitation message.
   */
  phone_e164: string;
}

export interface SearchUsersParams {
  keyword?: string;
  q?: string;
  /**
   * 指定搜索模式：`phone` 仅做手机号整号精确匹配，`username` 仅做用户名
   * 子串匹配。缺省时服务端按输入形态自动判断（纯数字 → phone，否则 username）。
   */
  mode?: "phone" | "username";
  /**
   * 手机号精确匹配时的默认国家/地区码（E.164 归一化用），如 "+86"。
   */
  default_country_code?: string;
}

export interface ContactRecord extends Contact {}

export interface UserContactsResponse {
  contacts: ContactRecord[];
}

export interface ContactListResponse {
  contacts: ContactListItem[];
}

export interface ContactMatchRequest {
  phones: string[];
}

export interface ContactMatchUser {
  phone_e164: string;
  user_id: number;
  nickname: string;
  username: string;
  avatar_url?: string;
}

export interface ContactMatchResponse {
  matched_users: ContactMatchUser[];
}

export interface SaveContactRequest {
  contact_user_id: number;
  remark_name?: string;
  remark_note?: string;
  source?: string;
}

export interface SaveContactResponse {
  contact: ContactRecord;
}

export interface UpdateContactRequest {
  remark_name?: string;
  remark_note?: string;
}

export interface UserBlocksResponse {
  blocks: UserBlock[];
}

export interface UpdateUserPrivacySettingsRequest {
  discoverable_by_username?: PrivacyRule;
  discoverable_by_phone?: PrivacyRule;
  message_permission?: PrivacyRule;
  presence_visibility?: PrivacyRule;
  read_receipts_visibility?: PrivacyRule;
}

export interface UpdateUserNotificationSettingsRequest {
  messages_enabled?: boolean;
  calls_enabled?: boolean;
  sound_enabled?: boolean;
  group_messages_enabled?: boolean;
  mention_only?: boolean;
  in_app_banner_enabled?: boolean;
  preview_mode?: NotificationPreviewMode;
  quiet_hours_enabled?: boolean;
  quiet_hours_start?: string;
  quiet_hours_end?: string;
  quiet_hours_allow_mentions?: boolean;
  quiet_hours_allow_calls?: boolean;
}

export interface RemoteConversationMember {
  conversation_id: string;
  user_id: number;
  joined_at: Date | string;
  role: number;
  nickname: string;
  avatar_url: string;
  muted_until?: Date | string;
  muted_by?: number;
}

export interface RemoteConversation {
  id: string;
  type: 1 | 2;
  name: string;
  owner_id: number;
  peer_id?: number;
  peer_username?: string;
  peer_nickname?: string;
  avatar_url?: string;
  last_message_content: Record<string, unknown>;
  last_message_time: string;
  last_message_send_id: number;
  unread_count: number;
  mention_unread_count?: number;
  last_sync_sequence: number;
  last_read_sequence: number;
  peer_last_read_sequence?: number;
  /**
   * Highest reaction sequence the server has assigned for this conversation.
   * Clients use it as the upper bound when deciding whether to pull more
   * reaction deltas. May be 0 for conversations without any reaction history.
   */
  last_reaction_sequence?: number;
  is_pinned: number;
  is_muted: number;
  is_archived?: number;
  draft?: string | null;
  description?: string;
  settings?: string;
  tail_loaded_from_seq?: number;
  tail_loaded_to_seq?: number;
  history_complete?: number;
  needs_backfill?: number;
  updated_at?: string;
  members?: RemoteConversationMember[];
}

export interface SyncCursorToken {
  updated_at: string;
  entity_id: string;
}

export interface UpdateConversationStateRequest {
  conversationId: string;
  is_pinned?: number;
  is_muted?: number;
  is_archived?: number;
  draft?: string | null;
}

export interface MarkConversationReadRequest {
  conversationId: string;
  readSequence?: number;
}

export interface MarkConversationReadResponse {
  conversation_id: string;
  read_seq: number;
  unread_count: number;
  updated_at: string;
}

/**
 * GET /api/conversation/:id/read-state 响应。
 * 仅会话成员可调用。后端会根据每个成员的 read_receipts_visibility 隐私设置
 * 过滤掉已关闭已读回执的成员（按 reader 维度过滤），并排除调用者自己。
 *
 * 用于群聊已读机制：客户端在打开会话 / WS 重连 / 拉到新成员消息时调用，
 * 将所有成员的 last_read_seq 高水位刷新到本端，弥补离线期间错过的 group_read 帧。
 */
export interface ConversationReadStateEntry {
  user_id: number;
  last_read_seq: number;
  updated_at: string;
}

export interface ConversationReadStateResponse {
  conversation_id: string;
  entries: ConversationReadStateEntry[];
}

export interface ConversationSyncParams {
  pageSize?: number;
  syncCursor?: string;
  pageNo?: number;
  lastSyncTime?: Date | string;
}

export interface ConversationSyncResponse {
  conversations: RemoteConversation[];
  nextSyncCursor: string | null;
  lastSyncTime: Date | string;
}

export type CreateConversationInput = Pick<
  Conversation,
  "type" | "name" | "owner_id"
> &
  Partial<
    Pick<
      Conversation,
      | "avatar_url"
      | "description"
      | "last_message_content"
      | "last_message_time"
    >
  >;

export interface CreateConversationRequest {
  conv: CreateConversationInput;
  members: ConversationMember[];
}

export interface CreateConversationResponse extends RemoteConversation {}

export interface CreateDirectConversationRequest {
  target_user_id: number;
}

export interface AddConversationMembersRequest {
  conversationId: string;
  members: Array<Pick<ConversationMember, "user_id" | "nickname" | "role">>;
}

export interface LeaveConversationRequest {
  conversationId: string;
}

export interface DeleteConversationRequest {
  conversationId: string;
}

export interface DisbandConversationRequest {
  conversationId: string;
}

export interface RemoveConversationMemberRequest {
  conversationId: string;
  userId: number;
}

export interface UpdateConversationMemberRoleRequest {
  conversationId: string;
  userId: number;
  role: number;
}

export interface TransferConversationOwnerRequest {
  conversationId: string;
  userId: number;
}

export interface UpdateConversationProfileRequest {
  conversationId: string;
  name: string;
  description?: string;
  avatar_url?: string;
}

export interface UpdateConversationAnnouncementRequest {
  conversationId: string;
  announcement?: string;
}

export interface UpdateConversationSettingsRequest {
  conversationId: string;
  mute_all?: boolean;
  invite_permission?: "all_members" | "admins_only";
  profile_edit_permission?: "admins" | "owner_only";
}

export interface UpdateConversationMemberMuteRequest {
  conversationId: string;
  userId: number;
  mute_minutes?: number | null;
}

export interface ConversationMemberMutationResponse {
  conversation_id: string;
  members: RemoteConversationMember[];
  messages: RemoteMessage[];
}

export interface RemoteMessage {
  id: string;
  client_message_id?: string;
  conversation_id: string;
  sender_id: number;
  type: number;
  content: Record<string, unknown>;
  created_at: string;
  updated_at?: string;
  sequence: number;
  is_recalled?: 0 | 1;
  is_favorited?: 0 | 1;
  is_pinned?: 0 | 1;
  client_conversation_id?: string;
  reply_to_message_id?: string;
  reply_to?: MessageReplyReference;
  sender_nickname?: string;
  sender_avatar?: string;
  reactions?: MessageReaction[];
}

export interface MessageSyncCursor {
  conversation_id: string;
  last_sequence: number;
  client_conversation_id: string;
}

export interface MessageDeltaParams {
  conversationId: string;
  clientConversationId: string;
  afterSequence?: number;
  limit?: number;
}

export interface MessageDeltaResponse {
  conversation_id: string;
  client_conversation_id: string;
  messages: RemoteMessage[];
  has_more: boolean;
  next_after_sequence: number;
  max_sequence: number;
  /**
   * 当前用户在该会话可见的最小 sequence。计算口径：
   * max(join_seq, hidden_before_seq + 1, 1)。客户端可据此让 history_complete
   * 状态收敛（例如 `tail_loaded_from_seq <= visible_from_sequence` 即视为已拉到起点）。
   * 字段可选以保持向后兼容（老服务端不返回时客户端按 0 处理 = 行为退化为原逻辑）。
   */
  visible_from_sequence?: number;
}

export interface MessageListParams {
  conversationId: string;
  clientConversationId: string;
  beforeSequence?: number;
  limit?: number;
}

export interface MessageAroundParams {
  conversationId: string;
  clientConversationId: string;
  pivotSequence: number;
  limit?: number;
}

export interface MessageListResponse {
  conversation_id: string;
  client_conversation_id: string;
  messages: RemoteMessage[];
  has_more: boolean;
  loaded_from_sequence: number;
  loaded_to_sequence: number;
  max_sequence: number;
  /**
   * 当前用户在该会话可见的最小 sequence。客户端可与 loaded_from_sequence 联合判定
   * 是否已经到达"可见历史起点"，从而把 history_complete 终态化。字段可选以保持向后兼容。
   */
  visible_from_sequence?: number;
  /**
   * 当 `has_more=false` 且 `loaded_from_sequence <= visible_from_sequence`（即本页已经
   * 触达可见起点），服务端会显式置为 true。客户端可据此立即把 history_complete=1，
   * 不再排队 history backfill。字段可选以保持向后兼容。
   */
  reached_history_start?: boolean;
}

export interface RecallMessageRequest {
  messageId: string;
  conversationId: string;
}

export interface RecallMessageResponse {
  message_id: string;
  conversation_id: string;
  sequence: number;
  client_message_id?: string;
  content: Record<string, unknown>;
  updated_at: string;
  recaller_id: number;
}

export interface MessageStateSyncParams {
  syncCursor?: string;
  lastSyncTime?: Date | string;
  pageSize?: number;
}

export interface MessageStateRecord {
  message_id: string;
  conversation_id: string;
  is_favorited: 0 | 1;
  is_pinned: 0 | 1;
  updated_at: string;
}

export interface MessageStateSyncResponse {
  states: MessageStateRecord[];
  nextSyncCursor: string | null;
  lastSyncTime: Date | string;
  hasMore: boolean;
}

export interface UpdateMessageStateRequest {
  messageId: string;
  conversationId: string;
  is_favorited?: number;
  is_pinned?: number;
}

export interface UpdateMessageStateResponse extends MessageStateRecord {}

export interface MessageReaction {
  message_id: string;
  conversation_id: string;
  user_id: number;
  emoji: string;
  /**
   * Per-conversation monotonic sequence assigned to this reaction event.
   * Used by the reaction delta sync to advance per-conversation cursors.
   * Optional for backward compatibility with old server responses (legacy
   * `/message/reactions` snapshot endpoint may omit it).
   */
  sequence?: number;
  /**
   * Tombstone flag: 1 means the reaction was removed and should be deleted
   * from the local cache. Active reactions omit this field or set it to 0.
   */
  is_deleted?: 0 | 1;
  updated_at: string;
}

export interface SetMessageReactionRequest {
  messageId: string;
  conversationId: string;
  emoji: string | null;
}

export type MessageReactionAction = "added" | "updated" | "removed";

export interface SetMessageReactionResponse {
  message_id: string;
  conversation_id: string;
  user_id: number;
  emoji: string | null;
  action: MessageReactionAction;
  /** Per-conversation sequence assigned to this reaction event. */
  sequence: number;
  updated_at: string;
}

export interface ListMessageReactionsParams {
  messageIds: string;
}

export interface ListMessageReactionsResponse {
  reactions: MessageReaction[];
}

export interface ListReactionDeltaParams {
  conversationId: string;
  afterSequence?: number;
  limit?: number;
}

export interface ListReactionDeltaResponse {
  conversation_id: string;
  reactions: MessageReaction[];
  has_more: boolean;
  next_after_sequence: number;
  max_sequence: number;
}

/**
 * Whitelist of emoji that can be applied as a message reaction.
 * Kept intentionally small for MVP. The server rejects any emoji not in this set.
 * Includes the 6 quick-reaction defaults plus a curated set of common single-emoji
 * picks. To extend, append here and ship to all clients before relying on the new value.
 */
export const ALLOWED_REACTION_EMOJIS: ReadonlyArray<string> = Object.freeze([
  // Quick reactions (top 6, also rendered as the default toolbar)
  "👍",
  "❤️",
  "😂",
  "😮",
  "😢",
  "🙏",
  // Extended common set
  "👎",
  "🎉",
  "🔥",
  "👏",
  "💯",
  "✅",
  "❌",
  "🤔",
  "😍",
  "😡",
  "😭",
  "😅",
  "😴",
  "🙌",
  "🤝",
  "💪",
  "💔",
  "👀",
  "🥳",
  "😎",
  "🤣",
  "😘",
  "🤯",
  "😱",
  "🚀",
  "⭐",
  "🌟",
  "💩",
  "🤡"
]);

export const QUICK_REACTION_EMOJIS: ReadonlyArray<string> = Object.freeze([
  "👍",
  "❤️",
  "😂",
  "😮",
  "😢",
  "🙏"
]);

export const REACTION_EMOJI_MAX_LENGTH = 32;

export function isAllowedReactionEmoji(emoji: string): boolean {
  return ALLOWED_REACTION_EMOJIS.includes(emoji);
}

export interface AttachmentUploadResponse {
  upload_id: string;
  url: string;
  object_name: string;
  originalname: string;
  size: number;
  mime_type?: string;
}

/** 客户端请求开启上传时声明的元数据。 */
export interface InitiateAttachmentUploadRequest {
  filename: string;
  size: number;
  mime_type?: string;
  /** 文件类别，影响服务端限额校验。 */
  category?: "image" | "video" | "audio" | "voice" | "file";
  /** 客户端推断需要 multipart（>= 服务端 multipartThreshold）。 */
  prefer_multipart?: boolean;
  /** 媒体维度元数据，便于服务端在 attachments 表预存。 */
  width?: number;
  height?: number;
  duration_ms?: number;
  /** 客户端建议的分片大小（字节）；服务端可覆盖。 */
  chunk_size?: number;
}

export type AttachmentUploadMode = "single" | "multipart";

/** `POST /file/attachment/initiate` 响应。 */
export interface InitiateAttachmentUploadResponse {
  upload_id: string;
  object_name: string;
  mode: AttachmentUploadMode;
  /** 当 mode === "single" 时返回的一次性 presigned PUT URL。 */
  put_url?: string;
  /** 当 mode === "multipart" 时由服务端创建的 MinIO uploadId。 */
  multipart_upload_id?: string;
  /** 实际使用的分片大小。 */
  chunk_size: number;
  /** Presigned URL 过期时间（秒）。 */
  expires_in: number;
}

export interface AttachmentPartUrlRequest {
  upload_id: string;
  part_number: number;
}

export interface AttachmentPartUrlResponse {
  upload_id: string;
  part_number: number;
  put_url: string;
  expires_in: number;
}

export interface AttachmentPartETag {
  part_number: number;
  etag: string;
}

export interface CompleteAttachmentUploadRequest {
  upload_id: string;
  /** multipart 模式时必填的各分片 ETag 列表（按 part_number 升序）。 */
  parts?: AttachmentPartETag[];
}

export interface CompleteAttachmentUploadResponse {
  upload_id: string;
  url: string;
  object_name: string;
  size: number;
  mime_type?: string;
  width?: number;
  height?: number;
  duration_ms?: number;
  thumb_status?: "pending" | "ready" | "failed" | "none";
}

export interface AbortAttachmentUploadRequest {
  upload_id: string;
}

export interface AbortAttachmentUploadResponse {
  upload_id: string;
  aborted: boolean;
}

/** 客户端在缓存的旧消息上加载附件 403 时，向服务端请求重新签发 URL。 */
export interface RefreshAttachmentUrlsRequest {
  /** 待刷新的 upload_id 列表（单次最多 100 项）。 */
  upload_ids: string[];
}

export interface RefreshAttachmentUrlsItem {
  upload_id: string;
  url?: string;
  thumb_url?: string;
  preview_url?: string;
  thumb_status: "none" | "pending" | "ready" | "failed";
}

export interface RefreshAttachmentUrlsResponse {
  /** key = upload_id；服务端只返回数据库中存在的项。 */
  items: Record<string, RefreshAttachmentUrlsItem>;
}

/** `GET /api/config/limits` 响应；保持与 shared LimitsConfig 同构。 */
export interface LimitsConfigResponse {
  maxTextLength: number;
  avatar: { maxBytes: number };
  attachments: {
    image: number;
    video: number;
    audio: number;
    voice: number;
    file: number;
  };
  upload: {
    chunkSize: number;
    concurrency: number;
    maxRetries: number;
    presignedExpiresSeconds: number;
    multipartThreshold: number;
  };
}

export interface DeleteContactRequest {
  target_user_id: number;
}

export interface BlockUserRequest {
  target_user_id: number;
}

export interface UnblockUserRequest {
  target_user_id: number;
}

export interface AuthSession {
  token: string;
  user: LoginUser;
}
