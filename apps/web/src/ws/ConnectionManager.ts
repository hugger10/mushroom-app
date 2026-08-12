import log from "@/utils/log";

const wsLog = log.scope("ws");

interface ConnectionManagerCallbacks {
  onReconnectScheduled?: (
    attempt: number,
    maxAttempts: number,
    delay: number
  ) => void;
  onReconnectExhausted?: (maxAttempts: number) => void;
}

export class ConnectionManager {
  private ws: WebSocket;
  private onReconnect: () => void;
  private callbacks?: ConnectionManagerCallbacks;

  private heartbeatInterval = 25000;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private pongReceived = true;

  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 3000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private missedPongs = 0;

  constructor(
    ws: WebSocket,
    onReconnect: () => void,
    callbacks?: ConnectionManagerCallbacks
  ) {
    this.ws = ws;
    this.onReconnect = onReconnect;
    this.callbacks = callbacks;
  }

  startHeartbeat() {
    if (this.heartbeatTimer) return;

    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        if (!this.pongReceived) {
          this.missedPongs += 1;
          wsLog.warn("heartbeat timeout, closing socket", {
            missedPongs: this.missedPongs
          });
          this.ws.close(4000, "No pong received");
          return;
        }
        this.pongReceived = false;
        this.ws.send(JSON.stringify({ messageClassify: "ping" }));
      }
    }, this.heartbeatInterval);
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  cancelReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  markPongReceived() {
    this.pongReceived = true;
  }

  resetReconnectAttempts() {
    this.reconnectAttempts = 0;
  }

  handleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      wsLog.warn("reconnect attempts exhausted", {
        attempts: this.maxReconnectAttempts
      });
      this.callbacks?.onReconnectExhausted?.(this.maxReconnectAttempts);
      return;
    }
    this.reconnectAttempts++;
    const delay =
      this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1);
    wsLog.info("reconnect scheduled", {
      attempt: this.reconnectAttempts,
      maxAttempts: this.maxReconnectAttempts,
      delayMs: delay
    });
    this.callbacks?.onReconnectScheduled?.(
      this.reconnectAttempts,
      this.maxReconnectAttempts,
      delay
    );
    this.cancelReconnect();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.onReconnect();
    }, delay);
  }

  getReconnectAttempts() {
    return this.reconnectAttempts;
  }

  getMaxReconnectAttempts() {
    return this.maxReconnectAttempts;
  }

  getMissedPongs() {
    return this.missedPongs;
  }
}
