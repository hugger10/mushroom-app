import type {
  ContactListItem,
  Conversation,
  LoginUser,
  Message,
  UserProfile
} from "@mushroom/shared";

export interface DeviceEnvironmentInfo {
  deviceId: string;
  deviceType: number;
  deviceName: string;
  appVersion?: string;
  pushProvider?: "jpush" | "fcm" | "huawei" | "xiaomi" | null;
  pushToken?: string | null;
  /**
   * iOS PushKit VoIP token. Registered alongside the regular push token so the
   * server can route `call.invite` over the APNs VoIP channel (reliably wakes a
   * killed/background app to show CallKit). Independent of `pushToken`.
   */
  voipToken?: string | null;
  pushAppId?: string | null;
  pushCapabilities?: string[];
  metadata?: Record<string, unknown>;
}

export interface AuthSessionSnapshot {
  accessToken: string | null;
  refreshToken: string | null;
  user: LoginUser | null;
  profile: UserProfile | null;
}

export interface SyncCheckpointSnapshot {
  contacts: string | null;
  conversations: string | null;
  messageStates: string | null;
}

export interface LocalDataSnapshot {
  contacts: ContactListItem[];
  conversations: Conversation[];
  messagesByConversation: Record<string, Message[]>;
  /**
   * 群聊已读高水位缓存：serverConversationId -> (readerUserId -> last_read_seq)。
   *
   * 仅用于群聊 UI 渲染本人发出消息的"已读勾"。
   * - 来源：WS `group_read` 帧增量推进 + `GET /api/conversation/:id/read-state` 全量补齐。
   * - 写入策略：按 (conv, reader) 取 max，单调递增，永远不回退。
   * - 可作为本地缓存持久化；冷启动先恢复本地视图，再由 read-state 校准。
   * - 私聊不写入此字段（私聊已读复用 `Conversation.peer_last_read_sequence`）。
   */
  groupReadStateByConversation: Record<string, Record<number, number>>;
}

export interface SyncMetrics {
  syncedContacts: number;
  syncedConversations: number;
  syncedMessages: number;
  syncedMessageStates: number;
  completedAt: string | null;
  /**
   * True while a `syncNow()` run is in progress. UI surfaces use this to
   * distinguish "data is being fetched right now" from "there is genuinely
   * nothing here" — e.g. the conversation list shows a skeleton instead of
   * the "no conversations" empty state during the first full sync after a
   * clean login.
   */
  syncing: boolean;
}

export interface MobileAppSnapshot {
  auth: AuthSessionSnapshot;
  checkpoints: SyncCheckpointSnapshot;
  data: LocalDataSnapshot;
  metrics: SyncMetrics;
}

export type MobileMessageSearchScope = "current" | "all";

export type MobileMessageSearchMatchScope = "all" | "body";

export type MobileMessageSearchFilter =
  | "all"
  | "text"
  | "images"
  | "videos"
  | "files"
  | "favorited"
  | "pinned"
  | "recalled";

export interface MobileAttachmentPayload {
  uploadId: string;
  name: string;
  url: string;
  size: number;
  mimeType?: string;
  /** 图片/视频原始宽（像素）。 */
  width?: number;
  /** 图片/视频原始高（像素）。 */
  height?: number;
  /** 视频/音频时长（毫秒）。 */
  durationMs?: number;
  /** 服务端缩略图状态（图片附件由服务端 sharp 异步生成）。 */
  thumbStatus?: "pending" | "ready" | "failed" | "none";
  /** 视频消息：客户端预先上传的首帧缩略图 upload_id。 */
  thumbnailUploadId?: string;
  /** 仅当客户端对图片做过压缩时记录的原始字节数（用于消息 content.original_size）。 */
  originalSize?: number;
}

export interface MobileMessageSearchResult {
  conversation: Conversation;
  message: Message;
  summary: string;
}

/**
 * Context delivered to {@link IncomingChatMessageHandler} whenever the
 * controller observes a brand-new, **incoming** chat message via the
 * realtime path (`handleRealtimeChatMessage`).
 *
 * Hosts (mobile / web / electron) subscribe to this in order to surface a
 * heads-up / system notification. The controller itself is unaware of
 * notification mechanics — it only reports "a new inbound message landed".
 */
export interface IncomingChatMessageContext {
  message: Message;
  conversation: Conversation;
  /** True when the user is currently viewing this conversation. */
  isActiveConversation: boolean;
  /** True when the message @-mentions the current user (or @all). */
  isMentioned: boolean;
  /** True when the message had already been persisted in the local store. */
  isDuplicate: boolean;
}

export type IncomingChatMessageHandler = (
  ctx: IncomingChatMessageContext
) => void | Promise<void>;
