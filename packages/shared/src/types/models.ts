export interface LoginUser {
  userId: number;
  username: string;
  nickname: string;
  device_id?: string;
  expires_in?: number;
  refresh_token?: string;
  access_token?: string;
  avatar?: string;
  email?: string;
  phone?: string;
  gender?: number;
  birthday?: string;
  signature?: string;
}

export interface Contact {
  user_id: number;
  contact_user_id?: number;
  username: string;
  nickname: string;
  remark_name?: string | null;
  remark_note?: string | null;
  source?: string | null;
  status?: string;
  avatar_url?: string;
  gender: number;
  signature?: string;
  updated_at: Date | string;
}

export interface ContactListItem extends Contact {
  is_blocked: boolean;
  blocked_at?: string;
}

export type PrivacyRule = 0 | 1 | 2;

export interface UserPrivacySettings {
  discoverable_by_username: PrivacyRule;
  discoverable_by_phone: PrivacyRule;
  message_permission: PrivacyRule;
  /**
   * P3：在线状态可见性。
   *  - 0 (anyone)         任何人都能看到我的在线状态 / 最近活跃时间
   *  - 1 (contacts_only)  仅互为联系人的人可见（默认）
   *  - 2 (nobody)         始终隐藏（is_online 强制 false、last_active_at 置空）
   */
  presence_visibility: PrivacyRule;
  /**
   * P3：已读回执可见性（私聊+群聊统一生效）。
   *  - 0 (anyone)         默认；他人能看到我已读他的消息，我也能看到对方对我的已读
   *  - 1 (contacts_only)  仅联系人之间互相可见（预留，当前等同 0）
   *  - 2 (nobody)         关闭已读回执；既不发出 read/group_read，也不会收到他人的回执
   *
   * 注意：关闭后本人仍可在自己消息详情面板看到完整已读列表（仅来自本端 last_read_seq 数据）。
   */
  read_receipts_visibility: PrivacyRule;
}

/**
 * 已读回执 / 隐私设置包络。`version` 用于多端同步幂等：
 * 仅在 incoming.version > current.version 时覆盖本地缓存，
 * 避免乱序 WS 推送 / 接口拉取导致旧值覆盖新值。
 */
export interface UserPrivacySettingsEnvelope {
  settings: UserPrivacySettings;
  version: number;
  updated_at: string;
}

export type NotificationPreviewMode = "full" | "sender" | "hidden";

export interface UserNotificationSettings {
  messages_enabled: boolean;
  calls_enabled: boolean;
  sound_enabled: boolean;
  group_messages_enabled: boolean;
  mention_only: boolean;
  in_app_banner_enabled: boolean;
  preview_mode: NotificationPreviewMode;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  quiet_hours_allow_mentions: boolean;
  quiet_hours_allow_calls: boolean;
}

export interface UserBlock {
  blocked_id: number;
  username: string;
  nickname: string;
  avatar_url?: string;
  gender: number;
  signature?: string;
  created_at: string;
}

export interface MessageReplyReference {
  message_id: string;
  sender_id: number;
  sender_nickname?: string;
  text: string;
}

export interface MessageForwardReference {
  conversation_id?: string;
  conversation_name?: string;
  sender_id: number;
  sender_nickname?: string;
  forwarded_at?: string;
}

export interface MessageMention {
  user_id: number;
  nickname: string;
}

export interface MessageFileContent {
  type: 2;
  name: string;
  url: string;
  size: number;
  mime_type?: string;
  upload_id?: string;
  /** 图片/视频原始宽（像素），客户端展示占位时使用。 */
  width?: number;
  /** 图片/视频原始高（像素）。 */
  height?: number;
  /** 视频/音频时长，毫秒。 */
  duration_ms?: number;
  /** 服务端异步生成的小缩略图 URL（图片：256² 内；视频：客户端首帧上传）。 */
  thumb_url?: string;
  /** 服务端异步生成的中等预览图 URL（图片长边 1280）。 */
  preview_url?: string;
  /** 缩略图状态：pending（生成中）/ ready / failed / none（无需缩略图）。 */
  thumb_status?: "pending" | "ready" | "failed" | "none";
  /** 视频消息携带的客户端首帧缩略图 upload_id（独立的图片附件）。 */
  thumbnail_upload_id?: string;
  /** 仅当客户端做过图片压缩时记录，便于未来 UI 展示"已压缩"提示。 */
  original_size?: number;
  /**
   * 客户端本地状态：标记该附件消息尚未完成上传。true 时 url/upload_id 字段可能为占位空串，
   * UI 应以"上传中/失败"形态渲染，禁止当成已就绪附件触发服务端发送。
   * 仅出现在本地消息记录中；通过 WebSocket 发送给服务端的载荷必须为 false/缺省。
   */
  upload_pending?: boolean;
  /** 客户端本地上传进度（0–100）。仅用于 UI 渲染，不持久化、不通过网络传输。 */
  upload_progress?: number;
  /**
   * 客户端本地文件 URI（web 为 object URL，mobile 为 file:// URI），上传完成前用于本地预览。
   * 上传成功后由真实 url 替换，本字段会被清空。
   */
  local_preview_uri?: string;
  /**
   * 视频附件的客户端本地首帧缩略图 URI。仅本地使用，上传成功后清空。
   * （移动端在视频上传开始前会先抽取首帧，便于占位气泡显示真实缩略图。）
   */
  local_thumbnail_uri?: string;
  /**
   * 客户端本地上传失败的错误文案。仅用于 UI 渲染失败气泡 + 重试按钮，
   * 不持久化到服务端、不通过 WebSocket 发送。重试成功后会被清空。
   */
  upload_error?: string;
  /**
   * 自有存储中原文件引用（"outbox"持久化层 key）。
   *
   * - Web / Electron 渲染进程：IndexedDB store 内的 key（推荐 `${client_message_id}:source`）。
   * - Electron 主进程：相对 `<userData>/outbox/<uid>/` 的子路径或绝对 file path。
   * - Mobile：自有沙箱 `outbox/<client_message_id>/source.<ext>` 的 `file://` 绝对路径。
   *
   * 仅本地存在；上传 ACK 成功后由 message-send-service 异步释放。
   */
  local_source_ref?: string;
  /**
   * 自有存储中缩略图引用（与 `local_source_ref` 同语义）。
   * ACK 后保留更久（直到列表滚走 / 用户清理），保证失败气泡和已发消息都
   * 可以离线渲染缩略图。
   */
  local_preview_ref?: string;
  /**
   * 占位卡片渲染分类。当 `local_preview_uri` 与 `local_preview_ref` 都不可用时，
   * UI 据此渲染图标 + 文件名 + 大小的占位，确保气泡永远不为空。
   */
  local_preview_kind?: "image" | "video" | "audio" | "file";
  /**
   * 启动恢复时检测 `local_source_ref` 失效（IndexedDB 项不存在 / file:// 文件被
   * 系统清理）后置位。UI 据此渲染"图片已不存在 + 重新选择文件"。
   */
  local_source_missing?: boolean;
  /** 原始文件名（供占位卡片显示，避免依赖 `name` 被改写）。 */
  original_file_name?: string;
  /** 原始文件大小（字节，供占位卡片显示）。 */
  original_file_size?: number;
}

export interface GroupConversationSettings {
  announcement?: string;
  announcement_updated_at?: string;
  announcement_updated_by?: number;
  mute_all?: boolean;
  invite_permission?: "all_members" | "admins_only";
  profile_edit_permission?: "admins" | "owner_only";
}

export type SystemMessageKind =
  | "conversation_created"
  | "message_recalled"
  | "group_member_joined"
  | "group_member_left"
  | "group_member_removed"
  | "group_role_updated"
  | "group_owner_transferred"
  | "group_announcement_updated"
  | "group_mute_all_updated"
  | "group_member_muted"
  | "group_member_unmuted"
  | "group_name_updated"
  | "group_settings_updated";

export interface SystemMessageActor {
  user_id: number;
  nickname?: string;
}

export interface SystemMessageContent {
  [key: string]: unknown;
  type: 0;
  kind: SystemMessageKind;
  text: string;
  actor?: SystemMessageActor;
  target?: SystemMessageActor;
  role?: string;
  enabled?: boolean;
  announcement?: string;
}

export interface Message {
  client_message_id: string;
  server_message_id: string;
  client_conversation_id: string;
  server_conversation_id?: string;
  sequence: number;
  content: Record<string, unknown>;
  sender_id: number;
  created_at: string;
  updated_at?: string;
  type: number;
  status: 0 | 1 | 2 | -1;
  is_recalled?: 0 | 1;
  reply_to_message_id?: string | null;
  reply_to?: MessageReplyReference | null;
  forward_from?: MessageForwardReference | null;
  sender_nickname?: string;
  sender_avatar?: string;
  is_favorited?: 0 | 1;
  is_pinned?: 0 | 1;
  reactions?: MessageReactionEntry[];
  retry_count?: number;
  next_retry_at?: string | null;
  last_error?: string | null;
}

export interface MessageReactionEntry {
  user_id: number;
  emoji: string;
  updated_at: string;
}

export interface LocalDBMessage extends Message {}

export interface Conversation {
  client_conversation_id: string;
  server_conversation_id: string;
  type: 1 | 2;
  name: string;
  avatar_url?: string;
  owner_id: number;
  peer_id?: number;
  peer_username?: string;
  peer_nickname?: string;
  last_message_send_id: number;
  last_message_content: Record<string, unknown>;
  last_message_time: string;
  unread_count: number;
  mention_unread_count?: number;
  last_sync_sequence: number;
  last_server_sequence?: number;
  sync_gap_detected?: number;
  tail_loaded_from_seq?: number;
  tail_loaded_to_seq?: number;
  history_complete?: number;
  needs_backfill?: number;
  last_read_sequence: number;
  peer_last_read_sequence?: number;
  status: number;
  is_pinned: number;
  is_muted: number;
  is_archived?: number;
  manual_unread_count?: number;
  draft?: string | null;
  description?: string;
  settings?: string;
  local_hidden_before_seq?: number;
  is_locally_deleted?: number;
  members?: ConversationMember[];
  display_name?: string;
  display_avatar?: string;
  last_message_sender_display_name?: string;
}

/** A single message item inside a merged-forward card. */
export interface MergedForwardItem {
  sender_id: number;
  sender_nickname: string;
  sender_avatar?: string;
  content: Record<string, unknown>;
  sent_at: string;
}

/** Content shape for a merged-forward (chat-record) message. */
export interface MergedForwardContent {
  type: "merged_forward";
  text: string;
  title: string;
  summary: string[];
  messages: MergedForwardItem[];
}

export interface ConversationMember {
  conversation_id?: string;
  user_id: number;
  nickname: string;
  avatar_url?: string;
  avatar?: string;
  role: number;
  joined_at?: Date | string;
  muted_until?: Date | string | null;
  muted_by?: number | null;
}

/**
 * Diff payload broadcast over the `conversation-sync` IPC channel from the
 * Electron main process to renderers. A missing payload (legacy callers)
 * means "refresh the full conversation list" — receivers must keep that
 * fallback for one release window.
 */
export interface ConversationSyncPayload {
  /** Free-form tag identifying the DB handler that emitted the event. */
  source: string;
  /**
   * Specific conversations whose mutable fields (last message, unread,
   * pin/mute/archive, sequences, ...) need to be re-read from the DB.
   */
  affectedClientConversationIds?: string[];
  /** Conversations that were physically removed from `local_conversations`. */
  removedClientConversationIds?: string[];
  /**
   * Set when the emitter cannot enumerate which conversations changed and
   * a full list refresh is required (e.g. bulk imports during cold sync).
   */
  allConversationsAffected?: boolean;
}

/**
 * Diff payload broadcast over the `message-sync` IPC channel. Carries the
 * exact rows that were inserted/updated so the renderer can patch its state
 * without reloading the active conversation from disk.
 */
export interface MessageSyncPayload {
  /** Free-form tag identifying the DB handler that emitted the event. */
  source: string;
  /**
   * Owning conversation. When omitted callers should fall back to the
   * (slower) full reload path.
   */
  clientConversationId?: string;
  /** Messages that should be merged into the renderer's in-memory list. */
  upsertedMessages?: Message[];
  /**
   * Messages whose backing rows were deleted (`local_messages` row removed).
   * Identified by `client_message_id` because that is the renderer's stable key.
   */
  removedClientMessageIds?: string[];
  /**
   * Set for handlers that touched many conversations at once (`apply-message-states`).
   * Renderers that cannot map the change to a single conversation must fall
   * back to a full reload.
   */
  affectsMultipleConversations?: boolean;
  /**
   * Drop ALL cached messages for `clientConversationId`. Used by handlers that
   * truncate the underlying table (clear / locally delete).
   */
  clearAllMessages?: boolean;
}
