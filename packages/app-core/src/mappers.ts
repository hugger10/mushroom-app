import type {
  ContactListItem,
  ContactRecord,
  Conversation,
  ConversationMember,
  Message,
  RemoteConversation,
  RemoteMessage,
  UserBlock
} from "@mushroom/shared";

export function createClientConversationId() {
  const runtimeCrypto = globalThis as {
    crypto?: {
      randomUUID?: () => string;
    };
  };

  if (
    runtimeCrypto.crypto &&
    typeof runtimeCrypto.crypto.randomUUID === "function"
  ) {
    return runtimeCrypto.crypto.randomUUID();
  }

  return `conv:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
}

export function mapContactToContactListItem(
  contact: ContactRecord
): ContactListItem {
  const userId = contact.contact_user_id ?? contact.user_id;

  return {
    user_id: userId,
    contact_user_id: userId,
    username: contact.username,
    nickname: contact.nickname,
    remark_name: contact.remark_name ?? null,
    remark_note: contact.remark_note ?? null,
    source: contact.source ?? null,
    status: contact.status ?? "normal",
    avatar_url: contact.avatar_url,
    gender: contact.gender,
    signature: contact.signature,
    is_blocked: false,
    updated_at: contact.updated_at
  };
}

export function mapBlockedUserToContactListItem(
  block: UserBlock
): ContactListItem {
  return {
    user_id: block.blocked_id,
    username: block.username,
    nickname: block.nickname,
    avatar_url: block.avatar_url,
    gender: block.gender,
    signature: block.signature,
    is_blocked: true,
    blocked_at: block.created_at,
    updated_at: block.created_at
  };
}

export function mapRemoteMessage(
  remote: RemoteMessage,
  clientConversationId: string
): Message {
  return {
    client_message_id: remote.client_message_id || `srv:${remote.id}`,
    server_message_id: remote.id,
    client_conversation_id: clientConversationId,
    server_conversation_id: remote.conversation_id,
    sequence: remote.sequence,
    updated_at: remote.updated_at,
    reply_to_message_id: remote.reply_to_message_id,
    reply_to: remote.reply_to,
    is_recalled: remote.is_recalled ?? 0,
    is_favorited: remote.is_favorited ?? 0,
    is_pinned: remote.is_pinned ?? 0,
    sender_id: remote.sender_id,
    sender_nickname: remote.sender_nickname,
    sender_avatar: remote.sender_avatar,
    content: remote.content,
    type: remote.type,
    created_at: remote.created_at,
    status: 0
  };
}

export function mapRemoteConversation(
  remote: RemoteConversation,
  clientConversationId: string
): Conversation {
  const members: ConversationMember[] = (remote.members ?? []).map(member => ({
    conversation_id: clientConversationId,
    user_id: member.user_id,
    nickname: member.nickname,
    avatar_url: member.avatar_url,
    role: member.role,
    joined_at: member.joined_at,
    muted_until: member.muted_until,
    muted_by: member.muted_by
  }));

  return {
    client_conversation_id: clientConversationId,
    server_conversation_id: remote.id,
    name: remote.name,
    owner_id: remote.owner_id,
    peer_id: remote.peer_id,
    peer_username: remote.peer_username,
    peer_nickname: remote.peer_nickname,
    avatar_url: remote.avatar_url,
    last_message_content: remote.last_message_content,
    last_message_time: remote.last_message_time,
    last_message_send_id: remote.last_message_send_id,
    unread_count: remote.unread_count || 0,
    mention_unread_count: remote.mention_unread_count || 0,
    type: remote.type,
    status: 0,
    last_read_sequence: remote.last_read_sequence || 0,
    is_muted: remote.is_muted,
    is_pinned: remote.is_pinned,
    is_archived: remote.is_archived || 0,
    draft: remote.draft ?? null,
    last_sync_sequence: 0,
    last_server_sequence: remote.last_sync_sequence || 0,
    sync_gap_detected: (remote.last_sync_sequence || 0) > 0 ? 1 : 0,
    tail_loaded_from_seq: remote.tail_loaded_from_seq || 0,
    tail_loaded_to_seq: remote.tail_loaded_to_seq || 0,
    history_complete: remote.history_complete || 0,
    needs_backfill: remote.needs_backfill || 0,
    local_hidden_before_seq: 0,
    is_locally_deleted: 0,
    peer_last_read_sequence: remote.peer_last_read_sequence || 0,
    settings: remote.settings,
    description: remote.description,
    members
  };
}
