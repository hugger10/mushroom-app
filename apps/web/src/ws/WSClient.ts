import { routeMessage } from "./router";
import type {
  AnyWsMessage,
  MessageHandler,
  ChatMessage,
  AckMessage,
  MessageErrorMessage
} from "./types";
import { getToken } from "../utils/token";
import { ConnectionManager } from "./ConnectionManager";
import log from "@/utils/log";
import { runSyncOrchestrator } from "../sync/orchestrator";

const wsLog = log.scope("ws");

// 周期性地输出连接级聚合日志，避免逐帧 / 逐心跳记录刷屏；与移动端
// `HEARTBEAT_SUMMARY_INTERVAL` 行为对齐（25s 心跳 × 12 ≈ 5 分钟）。
const CONN_SUMMARY_INTERVAL_MS = 5 * 60 * 1000;

export type WsUiState =
  | {
      status: "connecting" | "connected" | "offline";
      attempt: number;
      maxAttempts: number;
      nextDelayMs?: number;
    }
  | {
      status: "reconnecting";
      attempt: number;
      maxAttempts: number;
      nextDelayMs: number;
    };

const INITIAL_TAIL_SYNC_CONVERSATION_LIMIT = 10;

function resolveWebSocketUrl() {
  const explicitUrl = import.meta.env.VITE_WS_URL?.trim();
  if (explicitUrl) {
    return explicitUrl;
  }

  if (typeof window !== "undefined" && window.location?.host) {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}/ws`;
  }

  return "ws://127.0.0.1:9100/ws";
}

export class WSClient {
  private ws: WebSocket | null = null;
  private messageHandlers: Set<MessageHandler> = new Set();
  private connectedHandlers: Set<() => void | Promise<void>> = new Set();
  private url: string;
  private token?: string | null = null;
  private deviceId?: string | null = null;
  private connectPromise: Promise<void> | null = null;
  private syncing: boolean = false;
  private connectionManager: ConnectionManager | null = null;
  private statusHandlers: Set<(state: WsUiState) => void> = new Set();
  private manualClose = false;
  private uiState: WsUiState = {
    status: "connecting",
    attempt: 0,
    maxAttempts: 5
  };
  // 聚合统计：仅用于周期性日志，不参与业务。
  private framesIn = 0;
  private framesOut = 0;
  private connectStartedAt = 0;
  private summaryTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.url = resolveWebSocketUrl();
  }

  async init() {
    this.deviceId = await window.electronAPI.getDeviceId();
    wsLog.debug("DeviceId ready:", this.deviceId);
  }

  async connect() {
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.CONNECTING ||
        this.ws.readyState === WebSocket.OPEN)
    ) {
      return;
    }

    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = this.openConnection().finally(() => {
      this.connectPromise = null;
    });
    return this.connectPromise;
  }

  private async openConnection() {
    this.token = await getToken();
    if (!this.token) {
      wsLog.info(
        "Skipping WebSocket connect because no auth token is available"
      );
      this.manualClose = true;
      this.connectionManager?.cancelReconnect();
      this.updateUiState({
        status: "offline",
        attempt: 0,
        maxAttempts: this.connectionManager?.getMaxReconnectAttempts() ?? 5
      });
      return;
    }

    const params = new URLSearchParams();
    if (this.deviceId) params.append("deviceId", this.deviceId);
    const wsUrl = `${this.url}?${params.toString()}`;

    try {
      this.manualClose = false;
      this.framesIn = 0;
      this.framesOut = 0;
      this.connectStartedAt = Date.now();
      wsLog.info("connecting", {
        attempt: this.connectionManager?.getReconnectAttempts() ?? 0,
        host: this.url.replace(/^[a-z]+:\/\//, "").replace(/\/.*$/, "")
      });
      this.updateUiState({
        status: "connecting",
        attempt: this.connectionManager?.getReconnectAttempts() ?? 0,
        maxAttempts: this.connectionManager?.getMaxReconnectAttempts() ?? 5
      });
      this.ws = new WebSocket(wsUrl);
    } catch (err) {
      wsLog.error("Failed to create WebSocket:", err);
      this.handleReconnect();
      return;
    }

    this.connectionManager?.stopHeartbeat();
    this.connectionManager?.cancelReconnect();
    this.connectionManager = new ConnectionManager(
      this.ws,
      () => {
        void this.connect();
      },
      {
        onReconnectScheduled: (attempt, maxAttempts, delay) => {
          this.updateUiState({
            status: "reconnecting",
            attempt,
            maxAttempts,
            nextDelayMs: delay
          });
        },
        onReconnectExhausted: maxAttempts => {
          this.updateUiState({
            status: "offline",
            attempt: maxAttempts,
            maxAttempts
          });
        }
      }
    );

    this.ws.onopen = async () => {
      wsLog.info("open", {
        ms: Date.now() - this.connectStartedAt,
        attempt: this.connectionManager?.getReconnectAttempts() ?? 0
      });
      try {
        if (this.token && this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(
            JSON.stringify({ messageClassify: "auth", token: this.token })
          );
          this.framesOut += 1;
        }
      } catch (err) {
        wsLog.error("Failed to send auth message:", err);
        this.handleReconnect();
        return;
      }
      this.updateUiState({
        status: "connected",
        attempt: 0,
        maxAttempts: this.connectionManager?.getMaxReconnectAttempts() ?? 5
      });
      this.startConnSummaryTimer();
      await this.handleConnected();
    };

    this.ws.onmessage = event => {
      try {
        const message: AnyWsMessage = JSON.parse(event.data);
        this.framesIn += 1;
        if (message.messageClassify === "pong") {
          this.connectionManager?.markPongReceived();
        }
        routeMessage(message);
        this.messageHandlers.forEach(h => h(message));
      } catch (err) {
        wsLog.warn("malformed ws frame", err);
      }
    };

    this.ws.onclose = event => {
      wsLog.info(
        `close ${JSON.stringify({
          code: event.code,
          reason: event.reason,
          manualClose: this.manualClose,
          framesIn: this.framesIn,
          framesOut: this.framesOut,
          uptimeMs: this.connectStartedAt
            ? Date.now() - this.connectStartedAt
            : 0
        })}`
      );
      this.ws = null;
      this.connectionManager?.stopHeartbeat();
      this.stopConnSummaryTimer();
      if (!this.manualClose) {
        this.handleReconnect();
      } else {
        this.updateUiState({
          status: "offline",
          attempt: 0,
          maxAttempts: this.connectionManager?.getMaxReconnectAttempts() ?? 5
        });
      }
    };

    this.ws.onerror = err => {
      wsLog.warn("socket error", err);
    };
  }

  private handleReconnect() {
    if (this.manualClose) {
      return;
    }
    this.connectionManager?.handleReconnect();
  }

  private updateUiState(state: WsUiState) {
    this.uiState = state;
    this.statusHandlers.forEach(handler => handler(state));
  }

  private async waitForOpen(timeout = 8000): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    await this.connect();

    await new Promise<void>((resolve, reject) => {
      const socket = this.ws;
      if (!socket) {
        reject(new Error("WebSocket is unavailable"));
        return;
      }

      const timer = window.setTimeout(() => {
        cleanup();
        reject(new Error("WebSocket open timeout"));
      }, timeout);

      const cleanup = () => {
        window.clearTimeout(timer);
        socket.removeEventListener("open", handleOpen);
        socket.removeEventListener("error", handleError);
        socket.removeEventListener("close", handleClose);
      };

      const handleOpen = () => {
        cleanup();
        resolve();
      };
      const handleError = () => {
        cleanup();
        reject(new Error("WebSocket connection error"));
      };
      const handleClose = () => {
        cleanup();
        reject(new Error("WebSocket closed before opening"));
      };

      socket.addEventListener("open", handleOpen, { once: true });
      socket.addEventListener("error", handleError, { once: true });
      socket.addEventListener("close", handleClose, { once: true });
    });
  }

  private async handleConnected(): Promise<void> {
    if (!(await getToken())) {
      wsLog.info(
        "Skipping sync on connected WebSocket because auth token is gone"
      );
      this.close();
      return;
    }

    if (this.syncing) {
      wsLog.info("handleConnected: sync already in progress, skip");
      return;
    }
    this.syncing = true;

    try {
      wsLog.debug("handleConnected: start incremental sync");
      await runSyncOrchestrator({
        recentTailConversationLimit: INITIAL_TAIL_SYNC_CONVERSATION_LIMIT
      });

      wsLog.debug("handleConnected: sync finished");
    } catch (err) {
      wsLog.error("handleConnected: sync error:", err);
    } finally {
      this.syncing = false;
      this.connectionManager?.resetReconnectAttempts();
      this.connectionManager?.markPongReceived();
      this.connectionManager?.startHeartbeat();
      for (const handler of this.connectedHandlers) {
        Promise.resolve(handler()).catch(error => {
          wsLog.error("Connected handler failed", error);
        });
      }
    }
  }

  private startConnSummaryTimer() {
    this.stopConnSummaryTimer();
    this.summaryTimer = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return;
      }
      wsLog.info("conn summary", {
        framesIn: this.framesIn,
        framesOut: this.framesOut,
        missedPongs: this.connectionManager?.getMissedPongs() ?? 0,
        uptimeMs: this.connectStartedAt ? Date.now() - this.connectStartedAt : 0
      });
    }, CONN_SUMMARY_INTERVAL_MS);
  }

  private stopConnSummaryTimer() {
    if (this.summaryTimer) {
      clearInterval(this.summaryTimer);
      this.summaryTimer = null;
    }
  }

  addMessageHandler(handler: MessageHandler) {
    this.messageHandlers.add(handler);
  }

  removeMessageHandler(handler: MessageHandler) {
    this.messageHandlers.delete(handler);
  }

  addConnectedHandler(handler: () => void | Promise<void>) {
    this.connectedHandlers.add(handler);
  }

  removeConnectedHandler(handler: () => void | Promise<void>) {
    this.connectedHandlers.delete(handler);
  }

  addStatusHandler(handler: (state: WsUiState) => void) {
    this.statusHandlers.add(handler);
    handler(this.uiState);
  }

  removeStatusHandler(handler: (state: WsUiState) => void) {
    this.statusHandlers.delete(handler);
  }

  async sendMessage<T extends AnyWsMessage>(msg: T): Promise<T> {
    await this.waitForOpen();
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket unconnected, cannot send message");
    }
    this.ws.send(JSON.stringify(msg));
    this.framesOut += 1;
    return msg;
  }

  async sendMessageWithAck(
    msg: Partial<ChatMessage>,
    timeout = 5000
  ): Promise<AckMessage> {
    await this.waitForOpen();
    return new Promise((resolve, reject) => {
      const socket = this.ws;
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        reject(new Error("WebSocket unconnected, cannot send message"));
        return;
      }

      const cleanup = () => {
        window.clearTimeout(timer);
        socket.removeEventListener("message", listener);
        socket.removeEventListener("close", handleClose);
        socket.removeEventListener("error", handleError);
      };

      const timer = window.setTimeout(() => {
        cleanup();
        reject(new Error("Message ack timeout"));
      }, timeout);

      const listener = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data) as
            | AckMessage
            | MessageErrorMessage;
          if (
            data.messageClassify === "ack" &&
            data.client_message_id === msg.client_message_id
          ) {
            wsLog.debug("received ack message:", JSON.stringify(data));
            cleanup();
            resolve(data);
            return;
          }
          if (
            data.messageClassify === "message_error" &&
            data.client_message_id === msg.client_message_id
          ) {
            cleanup();
            reject(new Error(data.message || "WebSocket message send failed"));
          }
        } catch (e) {
          wsLog.error("Parse message failed in ack listener", e);
        }
      };

      const handleClose = () => {
        cleanup();
        reject(new Error("WebSocket closed before message ack"));
      };

      const handleError = () => {
        cleanup();
        reject(new Error("WebSocket error before message ack"));
      };

      socket.addEventListener("message", listener);
      socket.addEventListener("close", handleClose, { once: true });
      socket.addEventListener("error", handleError, { once: true });
      socket.send(JSON.stringify(msg));
      this.framesOut += 1;
    });
  }

  close() {
    wsLog.info("disconnect", {
      framesIn: this.framesIn,
      framesOut: this.framesOut
    });
    this.manualClose = true;
    this.connectionManager?.stopHeartbeat();
    this.connectionManager?.cancelReconnect();
    this.stopConnSummaryTimer();
    if (this.ws) {
      this.ws.close(1000, "Manual close");
      this.ws = null;
    }
  }

  retryConnection() {
    this.connectionManager?.resetReconnectAttempts();
    this.updateUiState({
      status: "connecting",
      attempt: 0,
      maxAttempts: this.connectionManager?.getMaxReconnectAttempts() ?? 5
    });
    this.connect();
  }

  getConnectionState(): string {
    if (!this.ws) return "CLOSED";
    switch (this.ws.readyState) {
      case WebSocket.CONNECTING:
        return "CONNECTING";
      case WebSocket.OPEN:
        return "OPEN";
      case WebSocket.CLOSING:
        return "CLOSING";
      case WebSocket.CLOSED:
        return "CLOSED";
      default:
        return "UNKNOWN";
    }
  }

  getUiState() {
    return this.uiState;
  }

  getDeviceId() {
    return this.deviceId ?? null;
  }
}
