import type {
  Contact,
  Message,
  UserBlock,
  UserPrivacySettings
} from "./models";
import type {
  CallEndReason,
  CallMediaType,
  CallParticipant,
  CallParticipationMode,
  CallScope,
  CallSession
} from "./call";
import type { MessageReactionAction } from "./api";

export type MessageClassify =
  | "auth"
  | "chat"
  | "presence"
  | "presence.subscribe"
  | "presence.unsubscribe"
  | "presence.snapshot"
  | "ack"
  | "message_error"
  | "typing"
  | "conversation_read"
  | "group_read"
  | "conversation_sync"
  | "message_recall"
  | "message_reaction"
  | "ping"
  | "pong"
  | "offer"
  | "answer"
  | "ice"
  | "call.invite.request"
  | "call.accept.request"
  | "call.reject.request"
  | "call.end.request"
  | "call.media-state.request"
  | "call.invited"
  | "call.ringing"
  | "call.accepted"
  | "call.rejected"
  | "call.busy"
  | "call.timeout"
  | "call.ended"
  | "call.state-sync"
  | "call.media-state"
  | "call.error"
  | "contact_changed"
  | "block_changed"
  | "attachment_updated"
  | "privacy_sync";

export type BaseWsMessage = {
  messageClassify: MessageClassify;
};

export type AuthMessage = BaseWsMessage & {
  messageClassify: "auth";
  token: string;
};

export type ChatMessage = BaseWsMessage &
  Message & {
    messageClassify: "chat";
  };

export type AckMessage = BaseWsMessage & {
  messageClassify: "ack";
  client_message_id: string;
  server_message_id: string;
  server_conversation_id: string;
  client_conversation_id: string;
  sequence: number;
  status: 0 | 1 | 2 | -1;
};

export type MessageErrorMessage = BaseWsMessage & {
  messageClassify: "message_error";
  client_message_id?: string;
  server_conversation_id?: string;
  code: string;
  message: string;
  timestamp: string;
};

export type PingMessage = BaseWsMessage & {
  messageClassify: "ping";
};

export type PongMessage = BaseWsMessage & {
  messageClassify: "pong";
};

export type PresenceChangedMessage = BaseWsMessage & {
  messageClassify: "presence";
  user_id: number;
  is_online: boolean;
  active_device_count: number;
  last_active_at?: string;
  /**
   * 服务端 P3 引入的"软在线"过期时间（ISO 字符串）。
   * 客户端在 `is_online === true` 时应同时校验 `expires_at > now`，避免硬关机/弱网场景误显示在线。
   * 兼容性：旧服务端可能不返回此字段，客户端需做缺省 fallback（视为永不过期，沿用旧行为）。
   */
  expires_at?: string;
  /**
   * 服务端测得该 presence 数据时的时间戳（ISO）。
   * 客户端 `mergePresenceSummary` 按 observed_at 大小决定是否覆盖 is_online，
   * 避免 HTTP `presence-batch` 与 WS `presence`/`presence.snapshot` 并发到达时的乱序导致状态闪烁。
   * 老版本服务端不会返回此字段；老版本客户端读不到也兼容（退化为旧行为）。
   */
  observed_at?: string;
  timestamp: string;
};

/**
 * 客户端订阅 presence。进入会话详情 / 会话列表 / 联系人列表时主动发送，
 * 服务端在 `Redis: presence:subs:{user_id}` 中登记订阅关系，
 * 之后被订阅用户的 presence 变更将通过 PresenceChangedMessage 推送给订阅者。
 *
 * 服务端在收到 subscribe 后会立刻回推一次 PresenceSnapshotMessage，
 * 让客户端获得当前快照（避免单纯依赖 HTTP 兜底）。
 */
export type PresenceSubscribeMessage = BaseWsMessage & {
  messageClassify: "presence.subscribe";
  user_ids: number[];
  /**
   * 订阅作用域，便于服务端识别"同一设备同时订阅会话详情 + 列表"的差异。
   * 当前服务端不区分语义，仅做调试 / 后续策略扩展用。
   */
  scope?: "conversation" | "list" | "profile";
};

export type PresenceUnsubscribeMessage = BaseWsMessage & {
  messageClassify: "presence.unsubscribe";
  user_ids: number[];
  scope?: "conversation" | "list" | "profile";
};

/**
 * 服务端在订阅成功后立即推送一次的快照（也用于 reconnect 后的批量补齐）。
 */
export type PresenceSnapshotMessage = BaseWsMessage & {
  messageClassify: "presence.snapshot";
  entries: Array<{
    user_id: number;
    is_online: boolean;
    active_device_count: number;
    last_active_at?: string;
    expires_at?: string;
    /** 与 PresenceChangedMessage.observed_at 同义，每条 entry 携带各自的服务端测量时刻。 */
    observed_at?: string;
  }>;
  timestamp: string;
};

export type ConversationReadMessage = BaseWsMessage & {
  messageClassify: "conversation_read";
  conversation_id: string;
  read_seq: number;
  unread_count: number;
  updated_at: string;
};

/**
 * 群聊已读回执（非持久化，仅在线投递）。
 *
 * 服务端仅向 message_sender_id（消息原作者）的所有在线设备投递；
 * payload 表示 reader_user_id 把 conversation_id 的已读高水位推进到 last_read_seq，
 * 因此 (message_sender_id 视角下) sequence ∈ (prev_seq, last_read_seq] 区间内
 * 由其本人发送且发件人不在 reader 黑名单内的消息可被视为已被 reader 读过。
 *
 * 客户端收到后只需把 (conv, reader) -> last_read_seq 写入本端 cache，
 * 不必为每条消息建立 read_by 数组：渲染层用 last_read_seq >= message.sequence 判定即可。
 *
 * 离线期间错过的帧由 GET /api/conversation/:id/read-state 在重连/打开会话时补齐。
 */
export type GroupReadMessage = BaseWsMessage & {
  messageClassify: "group_read";
  conversation_id: string;
  /** 消息原作者 user_id；client 只会收到与自己 user_id 匹配的帧 */
  message_sender_id: number;
  /** 已读人 user_id */
  reader_user_id: number;
  /** reader 的最新已读高水位（单调递增） */
  last_read_seq: number;
  /** server 推送时间 ISO8601 */
  updated_at: string;
};

export type ConversationSyncMessage = BaseWsMessage & {
  messageClassify: "conversation_sync";
  action: "remove" | "upsert";
  conversation_id: string;
};

export type MessageRecallMessage = BaseWsMessage & {
  messageClassify: "message_recall";
  server_message_id: string;
  server_conversation_id: string;
  client_message_id?: string;
  sequence: number;
  recaller_id: number;
  content: Record<string, unknown>;
  updated_at: string;
};

export type MessageReactionMessage = BaseWsMessage & {
  messageClassify: "message_reaction";
  server_message_id: string;
  server_conversation_id: string;
  user_id: number;
  emoji: string | null;
  action: MessageReactionAction;
  /** Per-conversation sequence assigned to this reaction event. */
  sequence: number;
  /** Tombstone flag mirroring `MessageReaction.is_deleted`. */
  is_deleted?: 0 | 1;
  updated_at: string;
};

export type TypingMessage = BaseWsMessage & {
  messageClassify: "typing";
  conversation_id: string;
  sender_user_id: number;
  /**
   * @deprecated Server fans out by `conversation_id`. Kept optional for
   * backward compatibility with older clients; new code should omit it.
   */
  target_user_id?: number;
  active: boolean;
  activity?: "text" | "voice";
  timestamp: string;
};

export type CallBaseMessage = BaseWsMessage & {
  call_id: string;
  conversation_id: string;
  call_scope: CallScope;
  media_type: CallMediaType;
  sender_user_id: number;
  sender_device_id: string;
  request_id?: string;
  timestamp: string;
};

export type CallSignalDescription = {
  type: "offer" | "answer" | "pranswer" | "rollback";
  sdp?: string;
};

export type CallIceCandidatePayload = {
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
};

export type CallInviteRequestMessage = CallBaseMessage & {
  messageClassify: "call.invite.request";
  target_user_ids: number[];
};

export type CallAcceptRequestMessage = CallBaseMessage & {
  messageClassify: "call.accept.request";
  local_audio_enabled?: boolean;
  local_video_enabled?: boolean;
};

export type CallRejectRequestMessage = CallBaseMessage & {
  messageClassify: "call.reject.request";
  reason?: CallEndReason;
};

export type CallEndRequestMessage = CallBaseMessage & {
  messageClassify: "call.end.request";
  reason?: CallEndReason;
};

export type CallMediaStateRequestMessage = CallBaseMessage & {
  messageClassify: "call.media-state.request";
  audio_enabled: boolean;
  video_enabled: boolean;
  participation_mode: CallParticipationMode;
};

export type CallInvitedMessage = CallBaseMessage & {
  messageClassify: "call.invited";
  session: CallSession;
  participants: CallParticipant[];
  timeout_seconds: number;
};

export type CallRingingMessage = CallBaseMessage & {
  messageClassify: "call.ringing";
  session: CallSession;
  participant: CallParticipant;
};

export type CallAcceptedMessage = CallBaseMessage & {
  messageClassify: "call.accepted";
  session: CallSession;
  participant: CallParticipant;
};

export type CallRejectedMessage = CallBaseMessage & {
  messageClassify: "call.rejected";
  session: CallSession;
  participant: CallParticipant;
  reason?: CallEndReason;
};

export type CallBusyMessage = CallBaseMessage & {
  messageClassify: "call.busy";
  session: CallSession;
  participant?: CallParticipant;
};

export type CallTimeoutMessage = CallBaseMessage & {
  messageClassify: "call.timeout";
  session: CallSession;
  participant?: CallParticipant;
};

export type CallEndedMessage = CallBaseMessage & {
  messageClassify: "call.ended";
  session: CallSession;
  reason?: CallEndReason;
};

export type CallStateSyncMessage = CallBaseMessage & {
  messageClassify: "call.state-sync";
  session: CallSession;
  participants: CallParticipant[];
};

export type CallMediaStateMessage = CallBaseMessage & {
  messageClassify: "call.media-state";
  audio_enabled: boolean;
  video_enabled: boolean;
  participation_mode: CallParticipationMode;
};

export type CallErrorMessage = BaseWsMessage & {
  messageClassify: "call.error";
  call_id?: string;
  conversation_id?: string;
  request_id?: string;
  code: string;
  message: string;
  timestamp: string;
};

export type CallSignalBaseMessage = CallBaseMessage & {
  target_user_id: number;
  target_device_id?: string;
};

export type OfferMessage = CallSignalBaseMessage & {
  messageClassify: "offer";
  description: CallSignalDescription;
};

export type AnswerMessage = CallSignalBaseMessage & {
  messageClassify: "answer";
  description: CallSignalDescription;
};

export type IceMessage = CallSignalBaseMessage & {
  messageClassify: "ice";
  candidate: CallIceCandidatePayload;
};

export type ContactChangedMessage = BaseWsMessage & {
  messageClassify: "contact_changed";
  action: "added" | "updated" | "removed";
  contact: Contact | { user_id: number };
};

export type BlockChangedMessage = BaseWsMessage & {
  messageClassify: "block_changed";
  action: "blocked" | "unblocked";
  block: UserBlock | { blocked_id: number };
};

/**
 * 服务端在异步生成图片缩略图 / 预览图完成后推送，客户端据此把消息气泡中的
 * `thumb_url` / `preview_url` 替换为真实链接。
 */
export type AttachmentUpdatedMessage = BaseWsMessage & {
  messageClassify: "attachment_updated";
  upload_id: string;
  thumb_url?: string;
  preview_url?: string;
  width?: number;
  height?: number;
  thumb_status: "ready" | "failed" | "none";
};

/**
 * 服务端在本人隐私设置变更后向本用户所有在线设备扇出（非持久化）。
 * 客户端使用 `version` 单调递增做幂等：仅在 incoming.version > current.version 时覆盖。
 */
export type PrivacySyncMessage = BaseWsMessage & {
  messageClassify: "privacy_sync";
  settings: UserPrivacySettings;
  version: number;
  updated_at: string;
};

export type ClientWsMessage =
  | AuthMessage
  | ChatMessage
  | TypingMessage
  | PingMessage
  | PresenceSubscribeMessage
  | PresenceUnsubscribeMessage
  | OfferMessage
  | AnswerMessage
  | IceMessage
  | CallInviteRequestMessage
  | CallAcceptRequestMessage
  | CallRejectRequestMessage
  | CallEndRequestMessage
  | CallMediaStateRequestMessage;

export type ServerWsMessage =
  | ChatMessage
  | AckMessage
  | MessageErrorMessage
  | PresenceChangedMessage
  | PresenceSnapshotMessage
  | TypingMessage
  | ConversationReadMessage
  | GroupReadMessage
  | ConversationSyncMessage
  | MessageRecallMessage
  | MessageReactionMessage
  | PongMessage
  | CallInvitedMessage
  | CallRingingMessage
  | CallAcceptedMessage
  | CallRejectedMessage
  | CallBusyMessage
  | CallTimeoutMessage
  | CallEndedMessage
  | CallStateSyncMessage
  | CallMediaStateMessage
  | CallErrorMessage
  | OfferMessage
  | AnswerMessage
  | IceMessage
  | ContactChangedMessage
  | BlockChangedMessage
  | AttachmentUpdatedMessage
  | PrivacySyncMessage;

export type AnyWsMessage = ServerWsMessage | ClientWsMessage;

export type MessageHandler = (msg: AnyWsMessage) => void;
