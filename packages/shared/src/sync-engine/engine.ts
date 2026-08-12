import {
  calculateContiguousSyncSequence,
  calculateTailWindow,
  normalizeProgress,
  reconcileProgress
} from "./reconciler";
import type { SyncRepository } from "./repository";
import type { ReconcileResult } from "./types";

export interface ReconcileSignals {
  /** Largest server sequence observed in the most recent hop. */
  observedServerSequence?: number | null;
  /** Authoritative server signal that older history is exhausted. */
  reachedHistoryStart?: boolean | null;
  /** Server-side visible-from boundary (group-join / hidden-before). */
  visibleFromSequence?: number | null;
}

/**
 * Reconcile a single conversation's sync progress and persist it.
 *
 * This is the storage-aware counterpart to `reconcileProgress`. It
 * loads the current row, recomputes contiguous / tail windows from
 * locally stored messages via the repository, applies the pure
 * reconciler, and writes the result back. Returns `null` when the
 * conversation has no progress row to update.
 */
export async function reconcileConversation(
  repository: SyncRepository,
  clientConversationId: string,
  signals: ReconcileSignals = {}
): Promise<ReconcileResult | null> {
  const existing = await repository.loadProgress(clientConversationId);
  if (!existing) return null;
  const progress = normalizeProgress(existing);

  const baseSequence = Math.max(
    progress.last_sync_sequence,
    progress.local_hidden_before_seq
  );
  const [ascSequences, descSequences] = await Promise.all([
    repository.listSequencesAscFrom(clientConversationId, baseSequence),
    repository.listSequencesDesc(clientConversationId)
  ]);

  const nextContiguous = calculateContiguousSyncSequence(
    baseSequence,
    ascSequences
  );
  const tail = calculateTailWindow(descSequences);

  const result = reconcileProgress({
    ...progress,
    next_contiguous_sequence: nextContiguous,
    tail_loaded_from_seq: tail.tail_loaded_from_seq,
    tail_loaded_to_seq: tail.tail_loaded_to_seq,
    observed_server_sequence: signals.observedServerSequence ?? null,
    reached_history_start: signals.reachedHistoryStart ?? null,
    visible_from_sequence: signals.visibleFromSequence ?? null
  });

  await repository.saveProgress(clientConversationId, result);
  if (repository.upsertBackfillJob && result.needs_backfill === 1) {
    await repository.upsertBackfillJob(clientConversationId);
  }
  return result;
}
