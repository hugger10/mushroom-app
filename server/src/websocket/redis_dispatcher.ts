import type { ServerWsMessage } from "@mushroom/shared";
import type Redis from "ioredis";
import { createSubscriber, getRedis } from "../cache/redis";
import { config } from "../utils/config";
import logger from "../utils/logger";
import type {
  WebSocketDeliveryOptions,
  WebSocketDisconnectOptions
} from "./types";

interface DispatchEnvelope {
  targetUserId: number | string;
  payload: ServerWsMessage;
  targetDeviceId?: string;
  excludeDeviceId?: string;
  sourceNodeId: string;
}

interface ControlCommand {
  targetUserId: number | string;
  targetDeviceId?: string;
  excludeDeviceId?: string;
  reason?: string;
  sourceNodeId: string;
}

/**
 * 跨节点 WS 派发桥（基于 Redis pub/sub）。
 *
 * 设计原则（业界标准）：
 *   - **本地 socket 直投是主路径**（在 ws_server.dispatchToUser 中完成），
 *     绝不依赖此模块。Redis pub/sub 是 fire-and-forget，不可靠且没有 ack。
 *   - 此模块仅在多节点部署时启用（config.server.multiNode === true），
 *     用于把派发指令"广播"给其他进程，让它们投递自己持有的 socket。
 *   - 单节点模式下：
 *       * `publishOnly` / `publishControlOnly` 全部 no-op
 *       * `start()` 不创建 subscriber 连接，零 zombie 风险
 *   - `start()` 可重入：每次执行会重新评估 `config.server.multiNode`，支持
 *     测试与运维场景下的模式切换（false→true 启动 subscriber，true→false 关停）。
 *
 * Subscriber liveness：
 *   多节点模式下，subscriber 是只读连接（执行 SUBSCRIBE 后只接收 server push）。
 *   笔记本休眠 / NAT 超时 / 网络抖动会让 OS 与 Redis 都"以为"对方还在，
 *   ioredis 不会触发重连，导致消息进 Redis 后没人订阅而被丢弃。
 *   防御措施：
 *     1) 30s 间隔主动 PING，10s 超时即 disconnect 触发重连；
 *     2) 重连后 `connect`/`ready` 任一事件都重新 SUBSCRIBE；
 *     3) ioredis 选项 keepAlive: 30_000 由 OS 内核兜底探测（参见 cache/redis.ts）。
 */
export class WebSocketRedisDispatcher {
  private subscriber: Redis | null = null;
  private subscriberStarted = false;
  private heartbeatTimer:
    | (ReturnType<typeof setInterval> & { unref?: () => void })
    | null = null;
  private readonly dispatchChannel = "ws:deliver";
  private readonly controlChannel = "ws:control";
  private static readonly HEARTBEAT_INTERVAL_MS = 30_000;
  private static readonly HEARTBEAT_TIMEOUT_MS = 10_000;

  constructor(
    private readonly nodeId: string,
    private readonly sendToUserLocal: (
      userId: number,
      data: ServerWsMessage,
      options?: WebSocketDeliveryOptions
    ) => number,
    private readonly disconnectUserLocalConnections: (
      userId: number,
      options?: WebSocketDisconnectOptions
    ) => number
  ) {}

  get subscriberStatus() {
    return this.subscriber?.status ?? "disabled";
  }

  /**
   * 单节点模式：完全跳过订阅，节省 Redis 连接 + 排除 zombie 风险。
   * 多节点模式：建立 subscriber、订阅频道、启动心跳。
   *
   * 可重入：根据当前 `config.server.multiNode` 与已启动状态自动调整：
   *   - multi & 已启动 multi    → no-op
   *   - single & 已启动 single  → no-op
   *   - single & 已启动 multi   → 关停 subscriber + heartbeat
   *   - multi & 未启动 / 已启动 single → 启动 subscriber + heartbeat
   */
  start() {
    const wantMulti = config.server.multiNode;
    const haveSubscriber = this.subscriber !== null;
    if (this.subscriberStarted && wantMulti === haveSubscriber) {
      return;
    }
    // 模式切换：先彻底 stop，再按新模式重启。
    if (this.subscriberStarted) {
      this.stop();
    }
    if (!wantMulti) {
      logger.info(
        "WS dispatcher running in single-node mode; Redis pub/sub bridge disabled."
      );
      this.subscriberStarted = true;
      return;
    }

    this.subscriberStarted = true;
    this.subscriber = createSubscriber("ws-dispatcher");
    this.subscribeRedisChannels();
    this.startSubscriberHeartbeat();
    logger.info(
      { nodeId: this.nodeId },
      "WS dispatcher running in multi-node mode; Redis pub/sub bridge enabled."
    );
  }

  stop() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.subscriber) {
      try {
        this.subscriber.disconnect();
      } catch {
        // ignore
      }
      this.subscriber = null;
    }
    this.subscriberStarted = false;
  }

  /**
   * 仅 publish 到其他节点；本节点的 socket 由调用方（ws_server.dispatchToUser）
   * 直接 sendToUserLocal 处理，无需绕道 Redis。
   *
   * 单节点模式下直接 no-op。
   */
  async publishOnly(
    userId: number | string,
    data: ServerWsMessage,
    options?: WebSocketDeliveryOptions
  ): Promise<void> {
    if (!config.server.multiNode) {
      return;
    }
    const normalizedUserId = Number(userId);
    if (!Number.isFinite(normalizedUserId)) {
      throw new Error(`Invalid websocket dispatch user id: ${String(userId)}`);
    }
    const envelope: DispatchEnvelope = {
      sourceNodeId: this.nodeId,
      targetUserId: normalizedUserId,
      targetDeviceId: options?.targetDeviceId,
      excludeDeviceId: options?.excludeDeviceId,
      payload: data
    };

    try {
      // 用 publisher（main client）发布；subscriber 不能执行普通命令。
      await getRedis().publish(this.dispatchChannel, JSON.stringify(envelope));
    } catch (error) {
      logger.warn(
        { err: error, userId: normalizedUserId },
        "Failed to publish ws dispatch envelope to peers; local delivery already done."
      );
    }
  }

  /**
   * 仅 publish 控制命令；本节点的断开操作由调用方直接执行。
   * 单节点模式下直接 no-op。
   */
  async publishControlOnly(
    userId: number | string,
    options?: WebSocketDisconnectOptions
  ): Promise<void> {
    if (!config.server.multiNode) {
      return;
    }
    const normalizedUserId = Number(userId);
    if (!Number.isFinite(normalizedUserId)) {
      throw new Error(
        `Invalid websocket disconnect user id: ${String(userId)}`
      );
    }

    const command: ControlCommand = {
      sourceNodeId: this.nodeId,
      targetUserId: normalizedUserId,
      targetDeviceId: options?.targetDeviceId,
      excludeDeviceId: options?.excludeDeviceId,
      reason: options?.reason
    };

    try {
      await getRedis().publish(this.controlChannel, JSON.stringify(command));
    } catch (error) {
      logger.warn(
        { err: error, userId: normalizedUserId },
        "Failed to publish ws control command to peers; local disconnect already done."
      );
    }
  }

  private subscribeRedisChannels() {
    const sub = this.subscriber;
    if (!sub) return;

    sub.on("message", (channel, rawMessage) => {
      try {
        if (channel === this.dispatchChannel) {
          this.handleDispatchEvent(JSON.parse(rawMessage) as DispatchEnvelope);
          return;
        }

        if (channel === this.controlChannel) {
          this.handleControlEvent(JSON.parse(rawMessage) as ControlCommand);
        }
      } catch (error) {
        logger.error(
          { err: error, channel },
          "Failed to handle websocket redis event"
        );
      }
    });

    // 重连后必须重订阅：ioredis 不会跨连接保留 SUBSCRIBE 状态。
    // `ready` 与 `connect` 任一触发都重订阅一次（idempotent，重复订阅同频道无副作用）。
    sub.on("ready", () => {
      void this.doSubscribe(0);
    });
    sub.on("connect", () => {
      void this.doSubscribe(0);
    });
    sub.on("reconnecting", (delayMs: number) => {
      logger.warn(
        { nodeId: this.nodeId, delayMs },
        "WS subscriber reconnecting"
      );
    });
    sub.on("error", error => {
      logger.warn(
        { err: error, nodeId: this.nodeId },
        "WS subscriber error event"
      );
    });

    void this.doSubscribe(0);
  }

  private doSubscribe(retryCount: number): Promise<void> {
    const sub = this.subscriber;
    if (!sub) return Promise.resolve();
    return sub
      .subscribe(this.dispatchChannel, this.controlChannel)
      .then(() => {
        if (retryCount > 0) {
          logger.info(
            { retryCount, nodeId: this.nodeId },
            "WS subscriber resubscribed after retries"
          );
        }
      })
      .catch(error => {
        logger.error(
          { err: error, retryCount },
          "Failed to subscribe websocket redis channels, retrying..."
        );
        const delay = Math.min(1000 * 2 ** retryCount, 30_000);
        setTimeout(() => {
          void this.doSubscribe(retryCount + 1);
        }, delay);
      });
  }

  /**
   * 应用层 PING 心跳：周期主动 PING，超时即强制 disconnect 触发自动重连。
   * 修复"subscriber 在笔记本休眠 / 网络中断后变僵尸（看似 ready 实际已死）"
   * 的经典 Redis pub/sub 陷阱。
   */
  private startSubscriberHeartbeat() {
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(() => {
      const sub = this.subscriber;
      if (!sub) return;
      // 仅在订阅器声称已就绪时才 PING；否则交给 ioredis 自身的重连。
      if (sub.status !== "ready") return;

      let timer: ReturnType<typeof setTimeout> | undefined;
      // 独立 catch 吞掉 ping 的迟到 rejection —— 当 timeout 先 reject 触发
      // disconnect 后，sub.ping() 会因连接断开而 reject 到一个无 handler 的
      // promise，造成 unhandledRejection 噪声。
      const pingPromise = sub.ping().catch((err: unknown) => {
        logger.debug(
          { err, nodeId: this.nodeId },
          "WS subscriber late ping rejection (race already settled)"
        );
        return undefined;
      });
      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("subscriber ping timeout")),
          WebSocketRedisDispatcher.HEARTBEAT_TIMEOUT_MS
        );
      });
      Promise.race([pingPromise, timeoutPromise])
        .catch(error => {
          logger.warn(
            { err: error, nodeId: this.nodeId, status: sub.status },
            "WS subscriber unhealthy, forcing reconnect"
          );
          try {
            sub.disconnect();
          } catch {
            // ignore — 即便 disconnect 抛错，ioredis 仍会按 retryStrategy 重连。
          }
        })
        .finally(() => {
          // 无论 ping 先成功还是 timeout 先触发，都要清掉定时器，
          // 防止"无人 await 的 timeout reject"二次触发 + 句柄泄漏。
          if (timer) clearTimeout(timer);
        });
    }, WebSocketRedisDispatcher.HEARTBEAT_INTERVAL_MS) as ReturnType<
      typeof setInterval
    > & { unref?: () => void };
    // node 环境下 unref 避免阻塞退出
    if (typeof this.heartbeatTimer.unref === "function") {
      this.heartbeatTimer.unref();
    }
  }

  private handleDispatchEvent(envelope: DispatchEnvelope) {
    // 自跳过：本节点已在 ws_server.dispatchToUser 中完成本地直投，
    // 收到自己 publish 的 envelope 时不能再投一次（否则 deviceId 上会双投）。
    if (envelope.sourceNodeId === this.nodeId) {
      return;
    }
    const targetUserId = Number(envelope.targetUserId);
    if (!Number.isFinite(targetUserId)) {
      throw new Error(
        `Invalid websocket dispatch target user id: ${String(envelope.targetUserId)}`
      );
    }

    const deliveredCount = this.sendToUserLocal(
      targetUserId,
      envelope.payload,
      {
        targetDeviceId: envelope.targetDeviceId,
        excludeDeviceId: envelope.excludeDeviceId
      }
    );
    logger.debug(
      {
        sourceNodeId: envelope.sourceNodeId,
        currentNodeId: this.nodeId,
        targetUserId,
        deliveredCount
      },
      "Redis websocket dispatch handled"
    );
  }

  private handleControlEvent(command: ControlCommand) {
    if (command.sourceNodeId === this.nodeId) {
      return;
    }
    const targetUserId = Number(command.targetUserId);
    if (!Number.isFinite(targetUserId)) {
      throw new Error(
        `Invalid websocket control target user id: ${String(command.targetUserId)}`
      );
    }
    const disconnectedCount = this.disconnectUserLocalConnections(
      targetUserId,
      {
        targetDeviceId: command.targetDeviceId,
        excludeDeviceId: command.excludeDeviceId,
        reason: command.reason
      }
    );
    logger.debug(
      {
        sourceNodeId: command.sourceNodeId,
        currentNodeId: this.nodeId,
        targetUserId,
        disconnectedCount
      },
      "Redis websocket control handled"
    );
  }
}
