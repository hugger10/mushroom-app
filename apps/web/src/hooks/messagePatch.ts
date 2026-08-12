import type { Conversation, Message } from "../types/chat";
import { sortMessagesForTimeline } from "../utils/messageTimeline";

export function mergeMessageLists(existing: Message[], incoming: Message[]) {
  const merged = new Map<string, Message>();
  for (const message of existing) {
    merged.set(message.client_message_id, message);
  }
  for (const message of incoming) {
    merged.set(message.client_message_id, message);
  }
  return Array.from(merged.values()).sort((a, b) => {
    const aSequence = Number(a.sequence ?? 0);
    const bSequence = Number(b.sequence ?? 0);
    if (aSequence > 0 && bSequence > 0 && aSequence !== bSequence) {
      return aSequence - bSequence;
    }
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
}

/**
 * Apply a `MessageSyncPayload`-like patch to the renderer's message buckets.
 * Returns the previous map reference when nothing actually changes so that
 * downstream `useEffect` consumers (notably `useMessageViewport`) don't
 * re-run and re-trigger scroll-to-bottom side effects.
 */
export function applyMessagesPatch(
  previous: Record<string, Message[]>,
  patch: {
    clientConversationId?: string;
    upsertedMessages?: Message[];
    removedClientMessageIds?: string[];
    clearAllMessages?: boolean;
  }
): Record<string, Message[]> {
  const conversationId = patch.clientConversationId;
  if (!conversationId) {
    return previous;
  }

  const existingList = previous[conversationId] ?? [];

  if (patch.clearAllMessages) {
    if (!(conversationId in previous)) {
      return previous;
    }
    const next = { ...previous };
    delete next[conversationId];
    return next;
  }

  const removeSet = new Set(patch.removedClientMessageIds ?? []);
  const upserted = patch.upsertedMessages ?? [];

  if (removeSet.size === 0 && upserted.length === 0) {
    return previous;
  }

  // Detect a no-op: every upserted message is byte-identical to the existing
  // entry and nothing is being removed.
  if (removeSet.size === 0 && upserted.length > 0) {
    const existingByKey = new Map(
      existingList.map(message => [message.client_message_id, message])
    );
    let dirty = false;
    for (const message of upserted) {
      const current = existingByKey.get(message.client_message_id);
      if (!current || !areMessagesShallowEqual(current, message)) {
        dirty = true;
        break;
      }
    }
    if (!dirty) {
      return previous;
    }
  }

  const filtered =
    removeSet.size === 0
      ? existingList
      : existingList.filter(
          message => !removeSet.has(message.client_message_id)
        );
  const merged =
    upserted.length === 0 ? filtered : mergeMessageLists(filtered, upserted);
  const next = sortMessagesForTimeline(merged);

  return {
    ...previous,
    [conversationId]: next
  };
}

function areMessagesShallowEqual(a: Message, b: Message) {
  return (
    a.server_message_id === b.server_message_id &&
    a.sequence === b.sequence &&
    a.status === b.status &&
    a.is_recalled === b.is_recalled &&
    a.is_favorited === b.is_favorited &&
    a.is_pinned === b.is_pinned &&
    a.updated_at === b.updated_at &&
    a.last_error === b.last_error &&
    a.sender_nickname === b.sender_nickname &&
    a.sender_avatar === b.sender_avatar &&
    JSON.stringify(a.content) === JSON.stringify(b.content) &&
    JSON.stringify(a.reactions ?? []) === JSON.stringify(b.reactions ?? [])
  );
}

/**
 * Patch one or more conversations into the list, preserving the previous
 * list reference if no observable field actually changed.
 */
export function applyConversationsPatch(
  previous: Conversation[],
  updates: Conversation[]
): Conversation[] {
  if (updates.length === 0) {
    return previous;
  }

  const updateMap = new Map(
    updates.map(conversation => [
      conversation.client_conversation_id,
      conversation
    ])
  );

  let dirty = false;
  const next = previous.map(conversation => {
    const update = updateMap.get(conversation.client_conversation_id);
    if (!update) {
      return conversation;
    }
    if (areConversationsShallowEqual(conversation, update)) {
      return conversation;
    }
    dirty = true;
    return { ...conversation, ...update };
  });

  // Newly observed conversations get appended (caller still owns ordering
  // for the post-fetch case; this branch covers IPC-driven inserts).
  const seen = new Set(previous.map(c => c.client_conversation_id));
  for (const update of updates) {
    if (!seen.has(update.client_conversation_id)) {
      next.push(update);
      dirty = true;
    }
  }

  return dirty ? next : previous;
}

function areConversationsShallowEqual(a: Conversation, b: Conversation) {
  return areConversationRenderFieldsEqual(a, b);
}

/**
 * Centralised "do the visible / sync-driving fields of two conversation
 * records match?" check. Used both by IPC-driven patching
 * (`applyConversationsPatch`) and by `mergeFetchedConversations` in
 * `useChatSync` so the two paths cannot drift on which fields they treat
 * as significant.
 */
export function areConversationRenderFieldsEqual(
  a: Conversation,
  b: Conversation
) {
  return (
    a.last_sync_sequence === b.last_sync_sequence &&
    a.last_server_sequence === b.last_server_sequence &&
    a.last_read_sequence === b.last_read_sequence &&
    a.tail_loaded_to_seq === b.tail_loaded_to_seq &&
    a.tail_loaded_from_seq === b.tail_loaded_from_seq &&
    a.unread_count === b.unread_count &&
    a.mention_unread_count === b.mention_unread_count &&
    a.is_pinned === b.is_pinned &&
    a.is_muted === b.is_muted &&
    a.is_archived === b.is_archived &&
    a.is_locally_deleted === b.is_locally_deleted &&
    a.last_message_time === b.last_message_time &&
    a.history_complete === b.history_complete &&
    a.needs_backfill === b.needs_backfill &&
    a.sync_gap_detected === b.sync_gap_detected &&
    a.display_name === b.display_name &&
    a.display_avatar === b.display_avatar &&
    // TODO: `JSON.stringify` is order-sensitive on object keys. Both call
    // sites currently feed payloads originating from a single normaliser
    // (`normalizeMessageRow` / `attachReactionsToRow` in the main process),
    // so key ordering is stable in practice. If we ever start mixing rows
    // from a second normaliser this comparison can return false negatives
    // and trigger a spurious patch. Replace with a stable comparator
    // (e.g. canonical JSON or field-level compare) before that happens.
    JSON.stringify(a.last_message_content ?? {}) ===
      JSON.stringify(b.last_message_content ?? {})
  );
}
