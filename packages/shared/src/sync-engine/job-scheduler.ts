import type { SyncJob, SyncTrigger } from "./types";

/**
 * Exponential backoff schedule for repeated job failures.
 * 30s -> 2m -> 10m -> 1h, then "give up" (return null).
 */
const BACKOFF_LADDER_MS: ReadonlyArray<number> = [
  30_000, 120_000, 600_000, 3_600_000
];

export function nextBackoffMs(attempts: number): number | null {
  if (attempts <= 0) return 0;
  if (attempts > BACKOFF_LADDER_MS.length) return null;
  return BACKOFF_LADDER_MS[attempts - 1] ?? null;
}

/**
 * In-memory per-conversation job queue. Coalesces duplicate jobs
 * of the same `(client_conversation_id, kind)` pair, preferring the
 * earliest `not_before_ms`.
 */
export class JobScheduler {
  private readonly jobs = new Map<string, SyncJob>();

  private key(clientConversationId: string, kind: SyncJob["kind"]): string {
    return `${kind}:${clientConversationId}`;
  }

  enqueue(job: SyncJob): void {
    const key = this.key(job.client_conversation_id, job.kind);
    const existing = this.jobs.get(key);
    if (!existing) {
      this.jobs.set(key, { ...job });
      return;
    }
    // Coalesce: take the earlier deadline, reset attempts on a
    // "fresh" trigger (anything that's not a fallback).
    const merged: SyncJob = {
      ...existing,
      not_before_ms: Math.min(existing.not_before_ms, job.not_before_ms),
      trigger: job.trigger,
      attempts: isFallbackTrigger(job.trigger) ? existing.attempts : 0
    };
    this.jobs.set(key, merged);
  }

  /** Return jobs whose `not_before_ms <= now`, sorted by deadline asc. */
  drainReady(nowMs: number): SyncJob[] {
    const ready: SyncJob[] = [];
    for (const [key, job] of this.jobs) {
      if (job.not_before_ms <= nowMs) {
        ready.push(job);
        this.jobs.delete(key);
      }
    }
    ready.sort((a, b) => a.not_before_ms - b.not_before_ms);
    return ready;
  }

  /**
   * Re-enqueue a failed job with backoff. Returns false when the
   * job has exceeded the backoff ladder and should be dropped.
   */
  reschedule(job: SyncJob, nowMs: number): boolean {
    const attempts = job.attempts + 1;
    const delay = nextBackoffMs(attempts);
    if (delay === null) return false;
    this.enqueue({
      ...job,
      attempts,
      not_before_ms: nowMs + delay
    });
    return true;
  }

  size(): number {
    return this.jobs.size;
  }

  /** For tests. */
  snapshot(): SyncJob[] {
    return Array.from(this.jobs.values());
  }
}

export function isFallbackTrigger(trigger: SyncTrigger): boolean {
  return trigger === "fallback-delta" || trigger === "fallback-history";
}
