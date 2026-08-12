import { computeExponentialBackoffMs } from "@mushroom/shared";
import type { OutboxQueueStats } from "../repository/outbox_repository";

export type OutboxHealthLevel = "healthy" | "warning";

type OutboxHealthThresholds = {
  pendingWarningThreshold?: number;
  processingWarningThreshold?: number;
};

const defaultThresholds: Required<OutboxHealthThresholds> = {
  pendingWarningThreshold: 200,
  processingWarningThreshold: 50
};

export function computeOutboxNextRetryAt(
  retryCount: number,
  options?: {
    now?: number;
    maxRetryDelayMs?: number;
    baseDelayMs?: number;
  }
) {
  const delay = computeExponentialBackoffMs(retryCount, {
    baseDelayMs: options?.baseDelayMs ?? 1000,
    maxDelayMs: options?.maxRetryDelayMs ?? 60_000
  });

  return new Date((options?.now ?? Date.now()) + delay);
}

export function getOutboxHealthLevel(
  queue: OutboxQueueStats,
  thresholds?: OutboxHealthThresholds
): OutboxHealthLevel {
  const nextThresholds = {
    ...defaultThresholds,
    ...thresholds
  };

  if (queue.retry > 0 || queue.dead > 0) {
    return "warning";
  }

  if (
    queue.pending >= nextThresholds.pendingWarningThreshold ||
    queue.processing >= nextThresholds.processingWarningThreshold
  ) {
    return "warning";
  }

  return "healthy";
}
