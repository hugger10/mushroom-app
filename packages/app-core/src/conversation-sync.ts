import type { Conversation, Message } from "@mushroom/shared";
import {
  calculateContiguousSyncSequence,
  calculateTailWindow,
  normalizeProgress,
  reconcileProgress
} from "@mushroom/shared";

/**
 * Shared per-conversation reconciler used by every storage backend
 * (in-memory snapshot, mobile SQLite, etc.). Wraps the pure
 * `@mushroom/shared` sync-engine so all platforms produce identical
 * `last_sync_sequence` / `tail_loaded_*` / `history_complete` /
 * `needs_backfill` / `sync_gap_detected` values for the same input.
 *
 * Electron uses its own DB-backed path
 * (`reconcileConversationSyncProgress` in apps/electron/src/main/database.ts)
 * because the row is updated inside a better-sqlite3 transaction, but
 * both code paths funnel into the same shared reconciler.
 */
export function recomputeConversationSyncProgress(
  conversation: Conversation,
  messages: Message[],
  options?: {
    observedServerSequence?: number | null;
    reachedHistoryStart?: boolean | null;
    visibleFromSequence?: number | null;
  }
): Conversation {
  const hiddenFloor = Number(conversation.local_hidden_before_seq ?? 0);

  const visibleMessages = messages.filter(item => {
    const sequence = Number(item.sequence || 0);
    return sequence <= 0 || sequence > hiddenFloor;
  });

  const latestMessage =
    visibleMessages.length > 0
      ? visibleMessages[visibleMessages.length - 1]
      : null;

  const sequencesAsc = Array.from(
    new Set(
      visibleMessages
        .map(item => Number(item.sequence || 0))
        .filter(item => item > hiddenFloor)
    )
  ).sort((left, right) => left - right);
  const sequencesDesc = [...sequencesAsc].reverse();

  const nextContiguous = Math.max(
    calculateContiguousSyncSequence(hiddenFloor, sequencesAsc),
    hiddenFloor
  );
  const tail = calculateTailWindow(sequencesDesc);

  const progress = normalizeProgress({
    last_sync_sequence: Number(conversation.last_sync_sequence ?? 0),
    last_server_sequence: Number(conversation.last_server_sequence ?? 0),
    tail_loaded_from_seq: Number(conversation.tail_loaded_from_seq ?? 0),
    tail_loaded_to_seq: Number(conversation.tail_loaded_to_seq ?? 0),
    local_hidden_before_seq: hiddenFloor,
    history_complete: conversation.history_complete === 1 ? 1 : 0
  });

  const result = reconcileProgress({
    ...progress,
    next_contiguous_sequence: nextContiguous,
    tail_loaded_from_seq: tail.tail_loaded_from_seq,
    tail_loaded_to_seq: tail.tail_loaded_to_seq,
    observed_server_sequence: options?.observedServerSequence ?? null,
    reached_history_start: options?.reachedHistoryStart ?? null,
    visible_from_sequence: options?.visibleFromSequence ?? null
  });

  return {
    ...conversation,
    last_message_content: latestMessage?.content ?? {},
    last_message_time: latestMessage?.created_at ?? "",
    last_message_send_id: latestMessage?.sender_id ?? 0,
    last_sync_sequence: result.last_sync_sequence,
    last_server_sequence: result.last_server_sequence,
    tail_loaded_from_seq: result.tail_loaded_from_seq,
    tail_loaded_to_seq: result.tail_loaded_to_seq,
    history_complete: result.history_complete,
    needs_backfill: result.needs_backfill,
    sync_gap_detected: result.sync_gap_detected
  };
}
