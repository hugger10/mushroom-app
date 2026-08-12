import type { ConversationSyncProgress, ReconcileResult } from "./types";

/**
 * Storage-agnostic repository contract used by the sync-engine.
 *
 * All methods are async to support both better-sqlite3 (Electron;
 * sync internally, wrapped in Promise.resolve) and expo-sqlite
 * (mobile; native async API).
 */
export interface SyncRepository {
  /** Load the persisted sync progress for a conversation, or null when unknown. */
  loadProgress(
    clientConversationId: string
  ): Promise<ConversationSyncProgress | null>;

  /**
   * Return locally stored sequences strictly greater than
   * `baseSequence`, sorted ascending. Used to compute the next
   * contiguous run.
   */
  listSequencesAscFrom(
    clientConversationId: string,
    baseSequence: number
  ): Promise<number[]>;

  /**
   * Return locally stored sequences (> 0) sorted descending. Used
   * to compute the tail window.
   */
  listSequencesDesc(clientConversationId: string): Promise<number[]>;

  /** Persist the reconciled progress. */
  saveProgress(
    clientConversationId: string,
    next: ReconcileResult
  ): Promise<void>;

  /**
   * Persist (or upsert) a pending backfill job descriptor. The
   * concrete storage may dedupe / coalesce.
   */
  upsertBackfillJob?(clientConversationId: string): Promise<void>;
}
