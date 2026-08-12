import type {
  AckMessage,
  AnyWsMessage,
  ChatMessage,
  ClientWsMessage,
  MessageErrorMessage,
  ServerWsMessage
} from "@mushroom/shared";
import log from "../utils/log";
import { HeartbeatController } from "./realtime/heartbeat";
import { ReconnectController } from "./realtime/reconnect";

export { resolveMobileWebSocketUrl } from "./realtime/url";

const wsLog = log.scope("ws");

export type MobileRealtimeStatus =
  | {
      status: "idle" | "connecting" | "connected" | "offline";
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

function createInitialStatus(): MobileRealtimeStatus {
  return {
    status: "idle",
    attempt: 0,
    maxAttempts: 5
  };
}

export class MobileRealtimeClient {
  private url: string;
  private readonly deviceId: string;
  private readonly getAccessToken: () => Promise<string | null | undefined>;
  private readonly onServerMessage: (message: ServerWsMessage) => Promise<void>;
  private readonly onConnected: (() => Promise<void>) | undefined;
  private readonly statusListeners = new Set<
    (status: MobileRealtimeStatus) => void
  >();
  private readonly messageListeners = new Set<
    (message: ServerWsMessage) => void | Promise<void>
  >();
  private socket: WebSocket | null = null;
  private connectPromise: Promise<void> | null = null;
  private reconnectPromise: Promise<void> | null = null;
  private manualClose = false;
  private pendingReconnect = false;
  private status: MobileRealtimeStatus = createInitialStatus();
  private connectStartedAt = 0;
  private readonly heartbeat = new HeartbeatController({ logger: wsLog });
  private readonly reconnector = new ReconnectController({ logger: wsLog });

  constructor(options: {
    url: string;
    deviceId: string;
    getAccessToken: () => Promise<string | null | undefined>;
    onServerMessage: (message: ServerWsMessage) => Promise<void>;
    onConnected?: () => Promise<void>;
  }) {
    this.url = options.url;
    this.deviceId = options.deviceId;
    this.getAccessToken = options.getAccessToken;
    this.onServerMessage = options.onServerMessage;
    this.onConnected = options.onConnected;
  }

  setUrl(nextUrl: string) {
    this.url = nextUrl;
  }

  addStatusListener(listener: (status: MobileRealtimeStatus) => void) {
    this.statusListeners.add(listener);
    listener(this.status);

    return () => {
      this.statusListeners.delete(listener);
    };
  }

  addMessageListener(
    listener: (message: ServerWsMessage) => void | Promise<void>
  ) {
    this.messageListeners.add(listener);

    return () => {
      this.messageListeners.delete(listener);
    };
  }

  async connect() {
    if (
      this.socket &&
      (this.socket.readyState === WebSocket.CONNECTING ||
        this.socket.readyState === WebSocket.OPEN ||
        this.socket.readyState === WebSocket.CLOSING)
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

  /**
   * Force-reconnect: tears down the current socket (even if it appears OPEN)
   * and establishes a fresh connection. Use after network recovery to avoid
   * relying on a potentially dead TCP connection.
   *
   * 修复竞争条件：旧版本在调用 socket.close() 后立刻把 manualClose 翻回
   * false 并调用 connect()，但 socket.close() 是异步的——onclose 会在稍后
   * 再次触发，此时 manualClose 已经是 false，导致 reconnector.schedule()
   * 又发起一次连接，服务端就会同时收到两个来自同一 deviceId 的连接请求，
   * 互相 terminate 对方，陷入无限循环。
   *
   * 修复策略：
   *   1. reconnectPromise 去重锁：并发的 reconnect() 复用同一个 Promise。
   *   2. manualClose 在整个关闭 → 重连序列中保持 true，通过 pendingReconnect
   *      标志让 onclose handler 在旧 socket 真正关闭后接力发起新连接，
   *      而不是在 onclose 内走 reconnector.schedule() 再次排队。
   */
  reconnect(): Promise<void> {
    if (this.reconnectPromise) {
      wsLog.info("force reconnect requested (deduped)");
      return this.reconnectPromise;
    }
    wsLog.info("force reconnect requested");
    this.reconnectPromise = this._doReconnect().finally(() => {
      this.reconnectPromise = null;
    });
    return this.reconnectPromise;
  }

  private async _doReconnect(): Promise<void> {
    // 若已有 connect() 正在建立（socket 尚未 OPEN），说明"新鲜连接"已经在路上，
    // 此时没有"旧的半死连接"需要强制替换——直接复用该 promise 即可。若在这里
    // 把 connectPromise 清空再重开一条 socket，会与服务端"同 deviceId 覆盖旧连接
    // 并 terminate"的策略打架：两条同 deviceId socket 并存 → 服务端顶掉其中一条
    // → 被顶掉那条的 onclose 又排队重连 → 新连接再顶掉当前连接 → 死循环
    // （表现为顶部"连接中.../收取中..."反复切换，杀掉进程重开才恢复正常）。
    if (this.connectPromise) {
      wsLog.info("force reconnect deferred: connect already in flight");
      return this.connectPromise;
    }

    // 停止心跳 + 取消挂起的重连定时器。
    this.heartbeat.stop();
    this.reconnector.cancel();
    this.reconnector.reset();

    if (!this.socket) {
      // 没有旧连接，直接发起新连接。
      this.manualClose = false;
      this.pendingReconnect = false;
      return this.connect();
    }

    // 有旧连接：先把它关掉，再由 onclose handler 接力发起新连接。
    // manualClose = true 确保 onclose 不走 reconnector.schedule() 重连逻辑，
    // pendingReconnect = true 告诉 onclose 这次关闭是为了强制重建。
    this.manualClose = true;
    this.pendingReconnect = true;

    return new Promise<void>(resolve => {
      const socket = this.socket!;

      const onSettled = () => {
        // onclose 已触发，旧 socket 真正关闭后再发起新连接。
        this.manualClose = false;
        this.pendingReconnect = false;
        this.connect().then(resolve, resolve);
      };

      const origOnClose = socket.onclose;
      socket.onclose = event => {
        // 先执行原有的 onclose（处理 heartbeat.stop / logging 等），
        // 再接力发起新连接。
        if (typeof origOnClose === "function") {
          origOnClose.call(socket, event);
        }
        onSettled();
      };

      // 使用 close() 发送正常关闭帧（code 1000），onclose 很快会到达。
      try {
        socket.close();
      } catch {
        // close() 失败（socket 已处于 CLOSED/CLOSING 状态）时直接接力。
        this.socket = null;
        onSettled();
      }
    });
  }

  disconnect() {
    const snapshot = this.heartbeat.snapshot();
    wsLog.info("disconnect", {
      framesIn: snapshot.framesIn,
      framesOut: snapshot.framesOut
    });
    this.manualClose = true;
    this.heartbeat.stop();
    this.reconnector.cancel();
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.updateStatus({
      status: "offline",
      attempt: this.reconnector.getAttempts(),
      maxAttempts: this.reconnector.getMaxAttempts()
    });
  }

  async sendChatMessage(message: ChatMessage, timeout = 5000) {
    await this.waitForOpen();

    return new Promise<AckMessage>((resolve, reject) => {
      const socket = this.socket;
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        reject(new Error("WebSocket is unavailable."));
        return;
      }

      const cleanup = () => {
        clearTimeout(timer);
        socket.removeEventListener("message", handleMessage);
        socket.removeEventListener("close", handleClose);
        socket.removeEventListener("error", handleError);
      };

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("Message acknowledgement timed out."));
      }, timeout);

      const handleMessage = (event: WebSocketMessageEvent) => {
        try {
          const payload = JSON.parse(String(event.data)) as
            | AckMessage
            | MessageErrorMessage;
          if (
            payload.messageClassify === "ack" &&
            payload.client_message_id === message.client_message_id
          ) {
            cleanup();
            resolve(payload);
            return;
          }
          if (
            payload.messageClassify === "message_error" &&
            payload.client_message_id === message.client_message_id
          ) {
            cleanup();
            reject(
              new Error(payload.message || "WebSocket message send failed")
            );
          }
        } catch {
          // Ignore unrelated websocket events while waiting for ack.
        }
      };

      const handleClose = () => {
        cleanup();
        reject(new Error("WebSocket closed before acknowledgement."));
      };

      const handleError = () => {
        cleanup();
        reject(new Error("WebSocket failed before acknowledgement."));
      };

      socket.addEventListener("message", handleMessage);
      socket.addEventListener("close", handleClose);
      socket.addEventListener("error", handleError);
      // 在序列化前剥离本地文件路径，确保所有调用路径（包括
      // flushOutgoingQueueEvent 后台重试）都不会泄漏 file:// URI 给其他客户端。
      const content =
        typeof message.content === "object" && message.content !== null
          ? { ...(message.content as Record<string, unknown>) }
          : message.content;
      if (typeof content === "object" && content !== null) {
        delete (content as Record<string, unknown>).local_preview_uri;
        delete (content as Record<string, unknown>).local_thumbnail_uri;
      }
      socket.send(JSON.stringify({ ...message, content }));
    });
  }

  async sendMessage(message: ClientWsMessage) {
    await this.waitForOpen();

    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket is unavailable.");
    }

    socket.send(JSON.stringify(message));
  }

  private async openConnection() {
    const accessToken = await this.getAccessToken();
    if (!accessToken) {
      wsLog.warn("connect aborted: no access token");
      this.updateStatus({
        status: "offline",
        attempt: 0,
        maxAttempts: this.reconnector.getMaxAttempts()
      });
      return;
    }

    const params = new URLSearchParams();
    params.set("deviceId", this.deviceId);
    const socketUrl = `${this.url}?${params.toString()}`;

    this.manualClose = false;
    this.heartbeat.resetCounters();
    this.connectStartedAt = Date.now();
    wsLog.info("connecting", {
      attempt: this.reconnector.getAttempts(),
      host: this.url.replace(/^[a-z]+:\/\//, "").replace(/\/.*$/, "")
    });
    this.updateStatus({
      status: "connecting",
      attempt: this.reconnector.getAttempts(),
      maxAttempts: this.reconnector.getMaxAttempts()
    });

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const socket = new WebSocket(socketUrl);
      this.socket = socket;

      socket.onopen = () => {
        // Authenticate via first message instead of URL query parameter.
        try {
          socket.send(
            JSON.stringify({ messageClassify: "auth", token: accessToken })
          );
          this.heartbeat.noteFrameOut();
        } catch (err) {
          settled = true;
          wsLog.error("auth send failed", err);
          reject(new Error("Failed to send auth message."));
          return;
        }

        wsLog.info("open", {
          ms: Date.now() - this.connectStartedAt,
          attempt: this.reconnector.getAttempts()
        });
        this.reconnector.reset();
        this.updateStatus({
          status: "connected",
          attempt: 0,
          maxAttempts: this.reconnector.getMaxAttempts()
        });
        this.heartbeat.start(
          () => this.socket,
          () => {
            this.socket?.close();
          }
        );
        if (this.onConnected) {
          void this.onConnected().catch(err => {
            wsLog.warn("onConnected handler failed", err);
            // Keep websocket connected even if the first sync attempt fails.
          });
        }
        settled = true;
        resolve();
      };

      socket.onmessage = event => {
        try {
          const payload = JSON.parse(String(event.data)) as AnyWsMessage;
          this.heartbeat.noteFrameIn();
          if (payload.messageClassify === "pong") {
            this.heartbeat.notePong();
            return;
          }

          if (payload.messageClassify === "ack") {
            return;
          }

          if (payload.messageClassify === "ping") {
            return;
          }

          for (const listener of this.messageListeners) {
            Promise.resolve(listener(payload as ServerWsMessage)).catch(err => {
              wsLog.warn("message listener failed", err);
              // Listener failures should not interrupt the realtime stream.
            });
          }

          void this.onServerMessage(payload as ServerWsMessage).catch(err => {
            wsLog.warn("onServerMessage failed", err);
            // Realtime handlers are best-effort; the next sync will reconcile.
          });
        } catch (err) {
          wsLog.warn("malformed ws frame", err);
          // Ignore malformed payloads for now.
        }
      };

      socket.onerror = err => {
        wsLog.warn("socket error", err);
        if (!settled) {
          settled = true;
          reject(new Error("WebSocket connection error."));
        }
      };

      socket.onclose = event => {
        const snapshot = this.heartbeat.snapshot();
        wsLog.info("close", {
          code: event?.code,
          reason: event?.reason,
          manualClose: this.manualClose,
          framesIn: snapshot.framesIn,
          framesOut: snapshot.framesOut,
          uptimeMs: this.connectStartedAt
            ? Date.now() - this.connectStartedAt
            : 0
        });
        // 先 settle 本次 socket 的 openConnection promise：无论连接是否建立成功，
        // close 都必须让等待方拿到结论，避免 connectPromise 悬挂。
        if (!settled) {
          settled = true;
          reject(new Error("WebSocket closed before connection established."));
        }
        // 关闭帧必须来自"当前活跃 socket"才能操作共享状态。若本次 close 属于
        // 已被更新的 socket 顶替的旧连接（同 deviceId 双连接的竞态被服务端
        // terminate），这里绝不能把 this.socket 置空 / 停掉属于新 socket 的心跳 /
        // 再排一次重连——否则会形成"新连接顶掉旧连接 → 旧 onclose 又排重连 →
        // 再顶掉新连接"的自持续死循环（顶部"连接中.../收取中..."反复切换）。
        if (this.socket !== socket) {
          wsLog.info("stale socket close ignored", {
            currentReadyState: this.socket?.readyState
          });
          return;
        }
        this.socket = null;
        this.heartbeat.stop();
        if (!this.manualClose) {
          this.reconnector.schedule(
            () => {
              void this.connect();
            },
            status => this.updateStatus(status)
          );
        } else {
          this.updateStatus({
            status: "offline",
            attempt: this.reconnector.getAttempts(),
            maxAttempts: this.reconnector.getMaxAttempts()
          });
        }
      };
    });
  }

  private async waitForOpen(timeout = 8000) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      return;
    }

    await this.connect();
    if (this.socket?.readyState === WebSocket.OPEN) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const socket = this.socket;
      if (!socket) {
        reject(new Error("WebSocket is unavailable."));
        return;
      }

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("WebSocket open timeout."));
      }, timeout);

      const cleanup = () => {
        clearTimeout(timer);
        socket.removeEventListener("open", handleOpen);
        socket.removeEventListener("close", handleClose);
        socket.removeEventListener("error", handleError);
      };

      const handleOpen = () => {
        cleanup();
        resolve();
      };

      const handleClose = () => {
        cleanup();
        reject(new Error("WebSocket closed before opening."));
      };

      const handleError = () => {
        cleanup();
        reject(new Error("WebSocket open failed."));
      };

      socket.addEventListener("open", handleOpen);
      socket.addEventListener("close", handleClose);
      socket.addEventListener("error", handleError);
    });
  }

  private updateStatus(status: MobileRealtimeStatus) {
    this.status = status;
    for (const listener of this.statusListeners) {
      listener(status);
    }
  }
}
