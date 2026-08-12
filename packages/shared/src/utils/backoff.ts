export type ExponentialBackoffOptions = {
  baseDelayMs?: number;
  maxDelayMs?: number;
  exponentOffset?: number;
};

export function computeExponentialBackoffMs(
  retryCount: number,
  options: ExponentialBackoffOptions = {}
) {
  const {
    baseDelayMs = 1000,
    maxDelayMs = 60_000,
    exponentOffset = 0
  } = options;
  const safeRetryCount = Number.isFinite(retryCount) ? retryCount : 0;
  const exponent = Math.max(0, safeRetryCount + exponentOffset);
  return Math.min(maxDelayMs, baseDelayMs * Math.pow(2, exponent));
}
