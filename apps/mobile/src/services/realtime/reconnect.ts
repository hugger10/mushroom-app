import type { Logger } from "@mushroom/shared/logger";
import type { MobileRealtimeStatus } from "../realtime";

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_BASE_DELAY_MS = 3000;
const DEFAULT_FACTOR = 1.5;

export interface ReconnectControllerOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  factor?: number;
  logger?: Pick<Logger, "info" | "warn">;
}

/**
 * Tracks reconnect attempts and schedules exponential backoff retries
 * without owning the websocket itself. Status updates are forwarded to
 * the caller so the parent client can keep its single source of truth.
 */
export class ReconnectController {
  private readonly maxAttempts: number;
  private readonly baseDelayMs: number;
  private readonly factor: number;
  private readonly logger: Pick<Logger, "info" | "warn"> | undefined;
  private attempts = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: ReconnectControllerOptions = {}) {
    this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
    this.factor = options.factor ?? DEFAULT_FACTOR;
    this.logger = options.logger;
  }

  getAttempts(): number {
    return this.attempts;
  }

  getMaxAttempts(): number {
    return this.maxAttempts;
  }

  reset(): void {
    this.attempts = 0;
  }

  cancel(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  schedule(
    reconnect: () => void,
    onStatus: (status: MobileRealtimeStatus) => void
  ): void {
    if (this.attempts >= this.maxAttempts) {
      this.logger?.warn("reconnect attempts exhausted", {
        attempts: this.attempts
      });
      onStatus({
        status: "offline",
        attempt: this.attempts,
        maxAttempts: this.maxAttempts
      });
      return;
    }

    this.attempts += 1;
    const delay = Math.round(
      this.baseDelayMs * Math.pow(this.factor, this.attempts - 1)
    );
    this.logger?.info("reconnect scheduled", {
      attempt: this.attempts,
      delayMs: delay
    });
    onStatus({
      status: "reconnecting",
      attempt: this.attempts,
      maxAttempts: this.maxAttempts,
      nextDelayMs: delay
    });
    this.timer = setTimeout(() => {
      this.timer = null;
      reconnect();
    }, delay);
  }
}
