import type {
  ConversationSyncProgress,
  ReconcileInput,
  ReconcileResult
} from "./types";

/**
 * Compute the next contiguous server sequence given the locally
 * stored sequences. `localSequencesAsc` MUST be sorted ascending and
 * contain only rows with `sequence > baseSequence`.
 */
export function calculateContiguousSyncSequence(
  baseSequence: number,
  localSequencesAsc: ReadonlyArray<number>
): number {
  let contiguous = Math.max(0, Number(baseSequence || 0));
  for (const raw of localSequencesAsc) {
    const seq = Number(raw || 0);
    if (seq <= contiguous) continue;
    if (seq === contiguous + 1) {
      contiguous = seq;
      continue;
    }
    break;
  }
  return contiguous;
}

/**
 * Compute the tail window (largest contiguous run that ends at the
 * newest stored sequence). `localSequencesDesc` MUST be sorted
 * descending and only contain rows with `sequence > 0`.
 */
export function calculateTailWindow(
  localSequencesDesc: ReadonlyArray<number>
): { tail_loaded_from_seq: number; tail_loaded_to_seq: number } {
  if (localSequencesDesc.length === 0) {
    return { tail_loaded_from_seq: 0, tail_loaded_to_seq: 0 };
  }
  const tailTo = Number(localSequencesDesc[0] || 0);
  let tailFrom = tailTo;
  for (let i = 1; i < localSequencesDesc.length; i += 1) {
    const seq = Number(localSequencesDesc[i] || 0);
    if (seq <= 0) continue;
    if (seq === tailFrom - 1) {
      tailFrom = seq;
      continue;
    }
    break;
  }
  return { tail_loaded_from_seq: tailFrom, tail_loaded_to_seq: tailTo };
}

/**
 * Pure reconciler. Given an existing {@link ConversationSyncProgress}
 * row, the recomputed contiguous + tail window, and any authoritative
 * server signals, compute the next sync state.
 *
 * The logic mirrors the original Electron implementation
 * (`reconcileConversationSyncProgress` in apps/electron/src/main/database.ts).
 */
export function reconcileProgress(input: ReconcileInput): ReconcileResult {
  const currentSyncSequence = Number(input.last_sync_sequence || 0);
  const localHiddenBeforeSequence = Number(input.local_hidden_before_seq || 0);
  const currentServerSequence = Number(
    input.last_server_sequence || currentSyncSequence
  );
  const tailLoadedFromSequence = Number(input.tail_loaded_from_seq || 0);
  const tailLoadedToSequence = Number(input.tail_loaded_to_seq || 0);

  const nextContiguousSequence = Math.max(
    currentSyncSequence,
    Number(input.next_contiguous_sequence || 0)
  );

  const nextServerSequence = Math.max(
    currentServerSequence,
    Number(input.observed_server_sequence ?? 0),
    nextContiguousSequence,
    tailLoadedToSequence
  );

  const effectiveTailLoadedToSequence = Math.max(
    tailLoadedToSequence,
    localHiddenBeforeSequence
  );

  // Authoritative server signal short-circuits history_complete when
  // the tail window already reaches the visible-from boundary.
  const visibleFrom = Number(input.visible_from_sequence ?? 0);
  const serverReachedStart =
    input.reached_history_start === true &&
    tailLoadedFromSequence > 0 &&
    (visibleFrom <= 0 || tailLoadedFromSequence <= Math.max(visibleFrom, 1));

  let nextHistoryComplete: 0 | 1;
  if (nextServerSequence === 0) {
    nextHistoryComplete = 1;
  } else if (nextServerSequence <= localHiddenBeforeSequence) {
    nextHistoryComplete = 1;
  } else if (serverReachedStart) {
    nextHistoryComplete = 1;
  } else if (
    tailLoadedFromSequence > 0 &&
    tailLoadedFromSequence <= localHiddenBeforeSequence + 1
  ) {
    nextHistoryComplete = 1;
  } else {
    nextHistoryComplete = 0;
  }

  const nextNeedsBackfill: 0 | 1 =
    nextServerSequence > effectiveTailLoadedToSequence ||
    nextHistoryComplete === 0
      ? 1
      : 0;

  const nextGapDetected: 0 | 1 =
    nextServerSequence >
      Math.max(nextContiguousSequence, localHiddenBeforeSequence) ||
    nextHistoryComplete === 0
      ? 1
      : 0;

  return {
    last_sync_sequence: nextContiguousSequence,
    last_server_sequence: nextServerSequence,
    sync_gap_detected: nextGapDetected,
    tail_loaded_from_seq: tailLoadedFromSequence,
    tail_loaded_to_seq: tailLoadedToSequence,
    history_complete: nextHistoryComplete,
    needs_backfill: nextNeedsBackfill
  };
}

/** Convenience type-guard for callers that only have a partial row. */
export function normalizeProgress(
  row: Partial<ConversationSyncProgress> | null | undefined
): ConversationSyncProgress {
  return {
    last_sync_sequence: Number(row?.last_sync_sequence || 0),
    last_server_sequence: Number(
      row?.last_server_sequence || row?.last_sync_sequence || 0
    ),
    tail_loaded_from_seq: Number(row?.tail_loaded_from_seq || 0),
    tail_loaded_to_seq: Number(row?.tail_loaded_to_seq || 0),
    local_hidden_before_seq: Number(row?.local_hidden_before_seq || 0),
    history_complete: row?.history_complete === 1 ? 1 : 0
  };
}
