import type { Conversation, Message } from "@mushroom/shared";

/**
 * Compute the per-conversation cutoff used by both the local "clear messages"
 * and "soft-delete" operations. The cutoff guarantees that any subsequent sync
 * will not re-fetch the messages we just hid, by raising the local hidden
 * floor (`local_hidden_before_seq`) and the various tail-loaded markers above
 * every sequence currently visible to the user.
 */
export function calculateConversationCutoff(
  conversation: Conversation,
  messages: Message[]
): number {
  const highestMessageSequence = messages.reduce(
    (max, item) => Math.max(max, Number(item.sequence || 0)),
    0
  );

  return Math.max(
    Number(conversation.local_hidden_before_seq ?? 0),
    Number(conversation.last_server_sequence ?? 0),
    Number(conversation.last_sync_sequence ?? 0),
    Number(conversation.tail_loaded_to_seq ?? 0),
    highestMessageSequence
  );
}

export type ConversationBlankOptions = {
  markLocallyDeleted: boolean;
};

/**
 * Build the field overrides applied to a conversation when its local messages
 * are wiped (either by `clearConversationMessages` or `softDeleteConversation`).
 *
 * Both operations share the same "blank-out" shape; the only difference is the
 * `is_locally_deleted` flag, controlled by `options.markLocallyDeleted`.
 *
 * Callers are responsible for:
 *   - Loading the conversation and its existing messages.
 *   - Computing the cutoff via {@link calculateConversationCutoff}.
 *   - Persisting the merged conversation record via their platform-specific
 *     write path (in-memory snapshot, SQLite upsert, etc.).
 */
export function buildConversationBlankPatch(
  cutoff: number,
  options: ConversationBlankOptions
): Partial<Conversation> {
  return {
    last_message_content: {},
    last_message_time: "",
    last_message_send_id: 0,
    last_sync_sequence: cutoff,
    tail_loaded_from_seq: cutoff,
    tail_loaded_to_seq: cutoff,
    history_complete: 1,
    needs_backfill: 0,
    sync_gap_detected: 0,
    unread_count: 0,
    mention_unread_count: 0,
    local_hidden_before_seq: cutoff,
    is_locally_deleted: options.markLocallyDeleted ? 1 : 0
  };
}
