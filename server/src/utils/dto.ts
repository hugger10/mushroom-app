import type {
  RemoteConversation,
  RemoteConversationMember,
  RemoteMessage,
  UserProfile,
  UserSearchResult
} from "@mushroom/shared";
import { parseJsonObject } from "./json";

type UserLike = {
  id: number;
  username: string;
  nickname: string;
  avatar_url?: string;
  email?: string;
  phone?: string;
  gender: number;
  birthday?: Date | string | null;
  signature?: string;
};

type ConversationLike = {
  id: string;
  type: number;
  name: string;
  owner_id?: number;
  peer_id?: number;
  peer_username?: string | null;
  peer_nickname?: string | null;
  avatar_url?: string;
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
  is_pinned?: number | boolean;
  is_muted?: number | boolean;
  is_archived?: number | boolean;
  draft?: string | null;
  description?: string;
  settings?: Record<string, unknown> | string | null;
  updated_at?: Date | string;
  members?: RemoteConversationMember[];
};

type ConversationMemberLike = {
  conversation_id: string;
  user_id: number;
  joined_at?: Date | string;
  role: number;
  nickname?: string;
  avatar_url?: string;
  muted_until?: Date | string | null;
  muted_by?: number | null;
};

type MessageLike = {
  id: number | string;
  client_message_id?: string | null;
  conversation_id: string;
  reply_to_message_id?: string | null;
  reply_to_sender_id?: number;
  reply_to_sender_nickname?: string;
  reply_to_content?: Record<string, unknown> | string;
  sender_id: number;
  type: number;
  content: Record<string, unknown> | string;
  created_at: Date | string;
  updated_at?: Date | string;
  sequence: number;
  is_recalled?: boolean | number;
  is_favorited?: boolean | number;
  is_pinned?: boolean | number;
  client_conversation_id?: string;
  sender_nickname?: string;
  sender_avatar?: string;
  /**
   * P2-A：list / around / delta 三类查询已通过子查询把活跃 reactions 聚合为一组
   * `MessageReactionRecord`-shape 的 JSON。`toRemoteMessage` 会在显式 `reactions`
   * 参数缺失时自动回退到这里，避免再发一次 `findActiveByMessageIds`。
   */
  reactions?: Array<{
    message_id: number | string;
    conversation_id: number | string;
    user_id: number;
    emoji: string;
    sequence?: number | string | null;
    is_deleted?: boolean;
    created_at?: Date | string;
    updated_at: Date | string;
  }>;
};

function toIsoString(value?: Date | string | null) {
  if (!value) return new Date(0).toISOString();
  return value instanceof Date ? value.toISOString() : value;
}

function normalizeJsonObject(
  value?: Record<string, unknown> | string | null
): Record<string, unknown> {
  if (!value) {
    return {};
  }

  if (typeof value !== "string") {
    return value;
  }

  return parseJsonObject(value) ?? { text: value };
}

export function toUserProfile(user: UserLike): UserProfile {
  return {
    id: user.id,
    username: user.username,
    nickname: user.nickname,
    avatar_url: user.avatar_url,
    email: user.email,
    phone: user.phone,
    gender: user.gender,
    birthday: user.birthday
      ? user.birthday instanceof Date
        ? user.birthday.toISOString().slice(0, 10)
        : String(user.birthday).slice(0, 10)
      : undefined,
    signature: user.signature
  };
}

export function toUserSearchResult(user: UserLike): UserSearchResult {
  return {
    user_id: user.id,
    username: user.username,
    nickname: user.nickname,
    avatar_url: user.avatar_url
  };
}

export function toRemoteConversationMember(
  member: ConversationMemberLike
): RemoteConversationMember {
  return {
    conversation_id: member.conversation_id,
    user_id: member.user_id,
    joined_at: member.joined_at ?? new Date(0).toISOString(),
    role: member.role,
    nickname: member.nickname ?? "",
    avatar_url: member.avatar_url ?? "",
    muted_until: member.muted_until
      ? toIsoString(member.muted_until)
      : undefined,
    muted_by: member.muted_by ?? undefined
  };
}

export function toRemoteConversation(
  conversation: ConversationLike
): RemoteConversation {
  return {
    id: conversation.id,
    type: conversation.type as 1 | 2,
    name: conversation.name,
    owner_id: conversation.owner_id ?? 0,
    peer_id: conversation.peer_id,
    peer_username: conversation.peer_username ?? undefined,
    peer_nickname: conversation.peer_nickname ?? undefined,
    avatar_url: conversation.avatar_url,
    last_message_content: normalizeJsonObject(
      conversation.last_message_content
    ),
    last_message_time: toIsoString(conversation.last_message_time),
    last_message_send_id: conversation.last_message_send_id ?? 0,
    unread_count: conversation.unread_count ?? 0,
    last_sync_sequence: conversation.last_sync_sequence ?? 0,
    last_read_sequence: conversation.last_read_sequence ?? 0,
    peer_last_read_sequence: conversation.peer_last_read_sequence ?? undefined,
    last_reaction_sequence: conversation.last_reaction_sequence ?? undefined,
    is_pinned: Number(conversation.is_pinned ?? 0),
    is_muted: Number(conversation.is_muted ?? 0),
    is_archived: Number(conversation.is_archived ?? 0),
    draft: conversation.draft ?? null,
    description: conversation.description,
    tail_loaded_from_seq: conversation.tail_loaded_from_seq ?? undefined,
    tail_loaded_to_seq: conversation.tail_loaded_to_seq ?? undefined,
    history_complete: conversation.history_complete ?? undefined,
    needs_backfill: conversation.needs_backfill ?? undefined,
    settings:
      typeof conversation.settings === "string"
        ? conversation.settings
        : conversation.settings
          ? JSON.stringify(conversation.settings)
          : undefined,
    updated_at: conversation.updated_at
      ? toIsoString(conversation.updated_at)
      : undefined,
    members: conversation.members
  };
}

export function toRemoteMessage(
  message: MessageLike,
  reactions?: import("@mushroom/shared").MessageReaction[]
): RemoteMessage {
  const replyContent = normalizeJsonObject(message.reply_to_content);
  // P2-A 回退：若调用方未显式传入 reactions，但 row 上携带了主查询聚合的 reactions，
  // 直接把它们映射为 shared 的 MessageReaction 形状（只输出 active 的，沿用既有契约）。
  let effectiveReactions = reactions;
  if (
    (!effectiveReactions || effectiveReactions.length === 0) &&
    Array.isArray(message.reactions) &&
    message.reactions.length > 0
  ) {
    effectiveReactions = message.reactions
      .filter(item => !item.is_deleted)
      .map(item => ({
        message_id: String(item.message_id),
        conversation_id: String(item.conversation_id),
        user_id: item.user_id,
        emoji: item.emoji,
        sequence:
          item.sequence === null || item.sequence === undefined
            ? undefined
            : Number(item.sequence),
        updated_at: toIsoString(item.updated_at)
      }));
  }
  return {
    id: String(message.id),
    client_message_id: message.client_message_id ?? undefined,
    conversation_id: message.conversation_id,
    reply_to_message_id: message.reply_to_message_id ?? undefined,
    reply_to:
      message.reply_to_message_id && message.reply_to_sender_id
        ? {
            message_id: message.reply_to_message_id,
            sender_id: message.reply_to_sender_id,
            sender_nickname: message.reply_to_sender_nickname,
            text: String(replyContent.text ?? "[引用消息]")
          }
        : undefined,
    sender_id: message.sender_id,
    type: message.type,
    content: normalizeJsonObject(message.content),
    created_at: toIsoString(message.created_at),
    updated_at: message.updated_at
      ? toIsoString(message.updated_at)
      : undefined,
    sequence: message.sequence,
    is_recalled: message.is_recalled ? 1 : 0,
    is_favorited: message.is_favorited ? 1 : 0,
    is_pinned: message.is_pinned ? 1 : 0,
    client_conversation_id: message.client_conversation_id,
    sender_nickname: message.sender_nickname,
    sender_avatar: message.sender_avatar,
    reactions:
      effectiveReactions && effectiveReactions.length > 0
        ? effectiveReactions
        : undefined
  };
}
