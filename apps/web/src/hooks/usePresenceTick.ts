import { useEffect, useState } from "react";

/**
 * Module-level shared ticker. All `usePresenceTick` consumers subscribe to a
 * single `setInterval` so that we never run more than one timer regardless of
 * how many avatars are mounted.
 */
let tickValue = 0;
let intervalId: ReturnType<typeof setInterval> | null = null;
const subscribers = new Set<(tick: number) => void>();

const DEFAULT_INTERVAL_MS = 60_000;

function ensureInterval(intervalMs: number) {
  if (intervalId !== null) {
    return;
  }
  intervalId = setInterval(() => {
    tickValue += 1;
    for (const notify of subscribers) {
      notify(tickValue);
    }
  }, intervalMs);
}

function teardownIfIdle() {
  if (subscribers.size === 0 && intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

/**
 * Returns a number that increments roughly every `intervalMs` ms.
 *
 * Use it as a memo dependency to force time-driven recomputation
 * (e.g. avatar presence level decay: online -> recent -> offline)
 * even when the underlying presence object reference does not change.
 *
 * Internally backed by a single shared interval to avoid timer churn
 * when many avatars are mounted at the same time.
 */
export function usePresenceTick(
  intervalMs: number = DEFAULT_INTERVAL_MS
): number {
  const [tick, setTick] = useState(tickValue);

  useEffect(() => {
    subscribers.add(setTick);
    ensureInterval(intervalMs);
    return () => {
      subscribers.delete(setTick);
      teardownIfIdle();
    };
  }, [intervalMs]);

  return tick;
}
