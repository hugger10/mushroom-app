/**
 * Shared sync-engine types.
 *
 * The sync-engine encapsulates per-conversation reconciliation logic
 * (contiguous sequence, tail window, history-complete) and a small
 * scheduler that orchestrates delta + tail backfill jobs across
 * platforms. Storage and network are injected via interfaces so the
 * same engine can run on top of better-sqlite3 (Electron) and
 * expo-sqlite (mobile).
 */

export interface ConversationSyncProgress {
  /** Largest contiguous server sequence the client has stored locally. */
  last_sync_sequence: number;
  /** Largest server sequence the client has observed (may be ahead of contiguous). */
  last_server_sequence: number;
  /**
   * From-seq of the contiguous "tail" run that includes the newest
   * message (0 if the conversation has no messages).
   */
  tail_loaded_from_seq: number;
  /** To-seq of the contiguous tail window. */
  tail_loaded_to_seq: number;
  /**
   * Sequence strictly below the locally visible window. Messages
   * with `seq <= local_hidden_before_seq` are intentionally not
   * stored locally (e.g. group-member join boundary, hidden-before
   * pin). The reconciler uses this as a "history-complete" floor.
   */
  local_hidden_before_seq: number;
  /** 1 when no further older history is expected. */
  history_complete: 0 | 1;
}

export interface ReconcileInput extends ConversationSyncProgress {
  /**
   * Largest server sequence the caller observed during the most
   * recent sync hop (from delta response, push payload, etc.).
   */
  observed_server_sequence?: number | null;
  /**
   * Highest contiguous sequence achievable on top of
   * `last_sync_sequence` given the locally stored messages.
   */
  next_contiguous_sequence: number;
  /** Tail window recomputed from locally stored messages. */
  tail_loaded_from_seq: number;
  tail_loaded_to_seq: number;
  /**
   * Optional authoritative signal from the server indicating that
   * the visible window starts at this sequence (group-join /
   * hidden-before). When provided we may converge history_complete
   * even when local rows are sparse.
   */
  reached_history_start?: boolean | null;
  visible_from_sequence?: number | null;
}

export interface ReconcileResult {
  last_sync_sequence: number;
  last_server_sequence: number;
  sync_gap_detected: 0 | 1;
  tail_loaded_from_seq: number;
  tail_loaded_to_seq: number;
  history_complete: 0 | 1;
  needs_backfill: 0 | 1;
}

export type SyncTrigger =
  | "boot"
  | "reconnect"
  | "ws-gap"
  | "push-gap"
  | "open-conversation"
  | "scroll-top"
  | "foreground"
  | "fallback-delta"
  | "fallback-history"
  | "manual";

export interface SyncJob {
  client_conversation_id: string;
  /** "delta" = fetch forward gap; "history" = fetch older tail backfill. */
  kind: "delta" | "history";
  trigger: SyncTrigger;
  /** Earliest time the job is allowed to run (epoch ms). */
  not_before_ms: number;
  /** Consecutive failure count (used for backoff). */
  attempts: number;
}
