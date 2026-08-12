import type { Conversation, Message } from "../types/models";

type MessageIdentity = Pick<Message, "client_message_id" | "server_message_id">;

function normalizeMessageIdentity(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

export function hasMatchingMessage(
  messages: MessageIdentity[],
  target: MessageIdentity
) {
  const targetServerMessageId = normalizeMessageIdentity(
    target.server_message_id
  );
  const targetClientMessageId = normalizeMessageIdentity(
    target.client_message_id
  );

  return messages.some(message => {
    const serverMessageId = normalizeMessageIdentity(message.server_message_id);
    if (targetServerMessageId && serverMessageId) {
      return targetServerMessageId === serverMessageId;
    }

    const clientMessageId = normalizeMessageIdentity(message.client_message_id);
    if (targetClientMessageId && clientMessageId) {
      return targetClientMessageId === clientMessageId;
    }

    return false;
  });
}

export function getNextUnreadCount(options: {
  currentUnreadCount?: number | null;
  isIncoming?: boolean | null;
  shouldMarkRead?: boolean | null;
  isDuplicate?: boolean | null;
}) {
  const currentUnreadCount = Number(options.currentUnreadCount || 0);

  if (options.shouldMarkRead || !options.isIncoming) {
    return 0;
  }

  if (options.isDuplicate) {
    return currentUnreadCount;
  }

  return currentUnreadCount + 1;
}

export function getNextMentionUnreadCount(options: {
  currentMentionUnreadCount?: number | null;
  isIncoming?: boolean | null;
  shouldMarkRead?: boolean | null;
  isDuplicate?: boolean | null;
  mentionMe?: boolean | null;
}) {
  const currentMentionUnreadCount = Number(
    options.currentMentionUnreadCount || 0
  );

  if (options.shouldMarkRead) {
    return 0;
  }

  if (!options.isIncoming || !options.mentionMe || options.isDuplicate) {
    return currentMentionUnreadCount;
  }

  return currentMentionUnreadCount + 1;
}

type UnreadConversation = Pick<Conversation, "unread_count"> &
  Partial<Pick<Conversation, "is_muted">>;

/**
 * Aggregate the total number of unread *messages* across conversations,
 * used to drive the OS app-icon badge (mobile) and the document-title
 * unread prefix (web). Mirrors WeChat: the badge shows a concrete count of
 * unread messages, and muted conversations are excluded by default so a
 * silenced group never inflates the springboard badge.
 *
 * Pure + dependency-free so it can be shared across web / mobile / desktop
 * and unit-tested in isolation.
 *
 * @param conversations conversation records carrying `unread_count` (and
 *   optionally `is_muted`).
 * @param options.excludeMuted when true (default), conversations with
 *   `is_muted` truthy are skipped.
 */
export function computeTotalUnread(
  conversations: readonly UnreadConversation[] | null | undefined,
  options?: { excludeMuted?: boolean }
): number {
  if (!conversations || conversations.length === 0) {
    return 0;
  }

  const excludeMuted = options?.excludeMuted ?? true;

  return conversations.reduce((sum, conversation) => {
    if (excludeMuted && Number(conversation.is_muted || 0) > 0) {
      return sum;
    }

    const unread = Number(conversation.unread_count || 0);
    return unread > 0 ? sum + unread : sum;
  }, 0);
}
