import type { Logger } from "@mushroom/shared/logger";

// Periodically emit a single aggregate counter instead of one log per
// inbound/outbound frame. Mobile log volume must stay low; storage budget
// for log files is bounded by the file transport rotation.
const DEFAULT_HEARTBEAT_INTERVAL_MS = 25_000;
const DEFAULT_SUMMARY_INTERVAL = 12; // ~5 minutes at 25s heartbeat

export interface HeartbeatSnapshot {
  framesIn: number;
  framesOut: number;
  missedPongs: number;
  heartbeatTick: number;
}

export interface HeartbeatControllerOptions {
  intervalMs?: number;
  summaryInterval?: number;
  logger?: Pick<Logger, "info" | "warn">;
}

/**
 * Heartbeat scheduling + aggregate frame counters for the mobile websocket.
 * Emits a summary log every `summaryInterval` ticks instead of per-frame
 * logging to keep mobile log volume bounded.
 */
export class HeartbeatController {
  private readonly intervalMs: number;
  private readonly summaryInterval: number;
  private readonly logger: Pick<Logger, "info" | "warn"> | undefined;
  private timer: ReturnType<typeof setInterval> | null = null;
  private pongReceived = true;
  private framesIn = 0;
  private framesOut = 0;
  private heartbeatTick = 0;
  private missedPongs = 0;

  constructor(options: HeartbeatControllerOptions = {}) {
    this.intervalMs = options.intervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
    this.summaryInterval = options.summaryInterval ?? DEFAULT_SUMMARY_INTERVAL;
    this.logger = options.logger;
  }

  start(getSocket: () => WebSocket | null, onTimeout: () => void): void {
    if (this.timer) {
      return;
    }

    this.pongReceived = true;
    this.timer = setInterval(() => {
      const socket = getSocket();
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        return;
      }

      if (!this.pongReceived) {
        this.missedPongs += 1;
        this.logger?.warn("heartbeat timeout, closing socket", {
          missedPongs: this.missedPongs
        });
        onTimeout();
        return;
      }

      this.pongReceived = false;
      socket.send(JSON.stringify({ messageClassify: "ping" }));
      this.framesOut += 1;
      this.heartbeatTick += 1;
      if (this.heartbeatTick % this.summaryInterval === 0) {
        this.logger?.info("heartbeat tick", {
          ticks: this.heartbeatTick,
          framesIn: this.framesIn,
          framesOut: this.framesOut,
          missedPongs: this.missedPongs
        });
      }
    }, this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  notePong(): void {
    this.pongReceived = true;
  }

  noteFrameIn(): void {
    this.framesIn += 1;
  }

  noteFrameOut(): void {
    this.framesOut += 1;
  }

  resetCounters(): void {
    this.framesIn = 0;
    this.framesOut = 0;
    this.heartbeatTick = 0;
    this.missedPongs = 0;
    this.pongReceived = true;
  }

  snapshot(): HeartbeatSnapshot {
    return {
      framesIn: this.framesIn,
      framesOut: this.framesOut,
      missedPongs: this.missedPongs,
      heartbeatTick: this.heartbeatTick
    };
  }
}
