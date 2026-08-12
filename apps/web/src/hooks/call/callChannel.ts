import type { AnyWsMessage, CallMediaType } from "@mushroom/shared";

/**
 * 主窗 ↔ 通话窗信令通道帧协议（见
 * docs/architecture/realtime-call.md §12.4）。
 *
 * 通道由主进程 MessageChannelMain 建立，两窗各持一个 MessagePort。
 * 该通道**只传通话帧**，不传聊天数据：
 *
 *   - signal       ：call.* / offer / answer / ice 原样透传（结构与 WS 一致）
 *   - ws-status    ：主窗 → 通话窗，广播 WS 连接状态
 *   - command      ：主窗 → 通话窗，把「发起呼叫」等用户意图转交通话窗执行
 *   - heartbeat    ：双向心跳，断线检测（§5.6 B2）
 */
export type CallChannelFrame =
  | { kind: "signal"; payload: AnyWsMessage }
  | { kind: "ws-status"; connected: boolean }
  | {
      kind: "command";
      action: "start-call";
      clientConversationId: string;
      mediaType: CallMediaType;
      /**
       * Optional user ids to invite (group calls). Omitted/empty means the
       * call window falls back to inviting the full group.
       */
      targetUserIds?: number[];
    }
  | { kind: "heartbeat"; ts: number };

/** 心跳发送间隔（ms）。 */
const HEARTBEAT_INTERVAL_MS = 2000;
/** 心跳超时阈值（ms）：超过即判定通道断裂。 */
const HEARTBEAT_TIMEOUT_MS = 6000;

export type CallChannelHandlers = {
  onSignal?: (payload: AnyWsMessage) => void;
  onWsStatus?: (connected: boolean) => void;
  onCommand?: (command: Extract<CallChannelFrame, { kind: "command" }>) => void;
  /** 心跳超时（对端失联）。两侧均可监听以触发安全收场（§5.6 B2）。 */
  onTimeout?: () => void;
};

/**
 * MessagePort 的薄封装：统一帧收发、心跳保活与超时检测。
 *
 * 两窗各自创建一个 CallChannel 实例。`start()` 后开始收发，`close()` 释放。
 * 心跳为双向：每侧定时发 heartbeat，并在收到任意帧时刷新「最近活跃」时间戳；
 * 超过 HEARTBEAT_TIMEOUT_MS 未收到任何帧即回调 onTimeout。
 */
export class CallChannel {
  private port: MessagePort;

  private handlers: CallChannelHandlers;

  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  private lastInboundAt = Date.now();

  private closed = false;

  /**
   * 超时一次性守卫：心跳检测每 HEARTBEAT_INTERVAL_MS 跑一次，但「对端失联」
   * 只应回调 onTimeout 一次，否则一次断链会被每个 tick 无限放大（日志刷屏 /
   * 反复 dismiss）。收到任意入向帧（重新连上）时复位，允许下次断链再次触发。
   */
  private firedTimeout = false;

  constructor(port: MessagePort, handlers: CallChannelHandlers = {}) {
    this.port = port;
    this.handlers = handlers;
  }

  start() {
    this.port.onmessage = (event: MessageEvent) => {
      this.lastInboundAt = Date.now();
      // 收到任意帧 = 对端仍在线：复位超时守卫，使下次断链可再次触发 onTimeout。
      this.firedTimeout = false;
      const frame = event.data as CallChannelFrame | undefined;
      if (!frame || typeof frame !== "object") {
        return;
      }
      switch (frame.kind) {
        case "signal":
          this.handlers.onSignal?.(frame.payload);
          break;
        case "ws-status":
          this.handlers.onWsStatus?.(frame.connected);
          break;
        case "command":
          this.handlers.onCommand?.(frame);
          break;
        case "heartbeat":
          // 仅用于刷新活跃时间戳（上方已处理）。
          break;
      }
    };
    this.port.start();

    this.heartbeatTimer = setInterval(() => {
      if (this.closed) {
        return;
      }
      this.post({ kind: "heartbeat", ts: Date.now() });
      if (
        !this.firedTimeout &&
        Date.now() - this.lastInboundAt > HEARTBEAT_TIMEOUT_MS
      ) {
        // 一次性触发：标记已触发，避免后续每个 tick 重复回调（刷屏放大）。
        // 收到对端任意帧后会在 onmessage 中复位，从而支持「断链→恢复→再断链」。
        this.firedTimeout = true;
        this.handlers.onTimeout?.();
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  post(frame: CallChannelFrame) {
    if (this.closed) {
      return;
    }
    try {
      this.port.postMessage(frame);
    } catch {
      // 端口已失效；交由心跳超时路径收场。
    }
  }

  /** 发送一条通话信令（出向）。 */
  postSignal(payload: AnyWsMessage) {
    this.post({ kind: "signal", payload });
  }

  setHandlers(handlers: CallChannelHandlers) {
    this.handlers = handlers;
  }

  close() {
    if (this.closed) {
      return;
    }
    this.closed = true;
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    try {
      this.port.onmessage = null;
      this.port.close();
    } catch {
      // ignore
    }
  }
}
