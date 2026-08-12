import type {
  ContactListItem,
  ContactRecord,
  Conversation,
  RemoteConversation,
  RemoteMessage,
  Message,
  UserBlock
} from "@mushroom/shared";

export function mapConversations(data: RemoteConversation[]): Conversation[];
export function mapConversations(data: RemoteConversation): Conversation;

export function mapConversations(
  data: RemoteConversation | RemoteConversation[]
): Conversation | Conversation[] {
  const convert = (item: RemoteConversation): Conversation => ({
    client_conversation_id: "",
    server_conversation_id: item.id,
    name: item.name,
    owner_id: item.owner_id,
    peer_id: item.peer_id,
    avatar_url: item.avatar_url,
    last_message_content: item.last_message_content,
    last_message_time: item.last_message_time,
    last_message_send_id: item.last_message_send_id,
    unread_count: item.unread_count || 0,
    mention_unread_count: item.mention_unread_count || 0,
    type: item.type,
    status: 0,
    last_read_sequence: item.last_read_sequence || 0,
    is_muted: item.is_muted,
    is_pinned: item.is_pinned,
    is_archived: item.is_archived || 0,
    draft: item.draft ?? null,
    last_sync_sequence: 0,
    last_server_sequence: item.last_sync_sequence || 0,
    sync_gap_detected: (item.last_sync_sequence || 0) > 0 ? 1 : 0,
    tail_loaded_from_seq: item.tail_loaded_from_seq || 0,
    tail_loaded_to_seq: item.tail_loaded_to_seq || 0,
    history_complete: item.history_complete || 0,
    needs_backfill: item.needs_backfill || 0,
    peer_last_read_sequence: item.peer_last_read_sequence || 0,
    settings: item.settings,
    description: item.description,
    local_hidden_before_seq: 0,
    is_locally_deleted: 0
  });

  return Array.isArray(data) ? data.map(convert) : convert(data);
}

export function mapMessages(data: RemoteMessage[]): Message[];
export function mapMessages(data: RemoteMessage): Message;

export function mapMessages(
  data: RemoteMessage | RemoteMessage[]
): Message | Message[] {
  const convert = (item: RemoteMessage): Message => ({
    client_message_id: item.client_message_id || `srv:${item.id}`,
    server_message_id: item.id,
    client_conversation_id: item.client_conversation_id || "",
    sequence: item.sequence,
    updated_at: item.updated_at,
    reply_to_message_id: item.reply_to_message_id,
    reply_to: item.reply_to,
    is_recalled: item.is_recalled ?? 0,
    is_favorited: item.is_favorited ?? 0,
    is_pinned: item.is_pinned ?? 0,
    sender_id: item.sender_id,
    sender_nickname: item.sender_nickname,
    content: item.content,
    type: item.type,
    created_at: item.created_at,
    status: 0,
    // Reactions are now synchronized through the dedicated reaction-delta
    // pipeline (see syncContext.fetchReactionDeltas) and persisted in the
    // electron `local_message_reactions` table. We intentionally ignore the
    // legacy `reactions` array carried on RemoteMessage so that creating /
    // backfilling messages cannot wipe out existing reaction state.
    reactions: []
  });

  if (Array.isArray(data)) {
    return data.map(convert);
  } else {
    return convert(data);
  }
}

export function mapContacts(data: ContactRecord[]): ContactListItem[];
export function mapContacts(data: ContactRecord): ContactListItem;
export function mapContacts(
  data: ContactRecord | ContactRecord[]
): ContactListItem | ContactListItem[] {
  const convert = (item: ContactRecord): ContactListItem => {
    const userId = item.contact_user_id ?? item.user_id;

    return {
      user_id: userId,
      contact_user_id: userId,
      username: item.username,
      nickname: item.nickname,
      remark_name: item.remark_name ?? null,
      remark_note: item.remark_note ?? null,
      source: item.source ?? null,
      status: item.status ?? "normal",
      avatar_url: item.avatar_url,
      gender: item.gender,
      signature: item.signature,
      is_blocked: false,
      updated_at: item.updated_at
    };
  };

  return Array.isArray(data) ? data.map(convert) : convert(data);
}

export function mapBlockedUsers(data: UserBlock[]): ContactListItem[];
export function mapBlockedUsers(data: UserBlock): ContactListItem;
export function mapBlockedUsers(
  data: UserBlock | UserBlock[]
): ContactListItem | ContactListItem[] {
  const convert = (item: UserBlock): ContactListItem => ({
    user_id: item.blocked_id,
    username: item.username,
    nickname: item.nickname,
    avatar_url: item.avatar_url,
    gender: item.gender,
    signature: item.signature,
    is_blocked: true,
    blocked_at: item.created_at,
    updated_at: item.created_at
  });

  return Array.isArray(data) ? data.map(convert) : convert(data);
}
