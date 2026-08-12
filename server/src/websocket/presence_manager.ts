import type {
  PresenceChangedMessage,
  PresenceSnapshotMessage
} from "@mushroom/shared";
import { getRedis } from "../cache/redis";
import ContactRepository from "../repository/contact_repository";
import UserDeviceRepository from "../repository/user_device_repository";
import { config } from "../utils/config";
import logger from "../utils/logger";
import {
  loadPresenceVisibilityContext,
  loadPresenceVisibilityForBroadcast
} from "../service/presence_visibility";
import { PresenceSubscriptionManager } from "./presence_subscription_manager";
import type { Client, ClientRegistry } from "./types";

const redis = getRedis();

export class WebSocketPresenceManager {
  public readonly subscriptions: PresenceSubscriptionManager;

  /**
   * P3.4：presence transition 抖动 debounce。
   * 短时间内的连续上下线（断网瞬连、刷新页面、移动端切前后台）可能产生抖动；
   * 通过 per-user 3 秒 debounce 合并末值，flush 时再以"当下最新 summary 与上次稳定状态"对比，
   * 避免推送无意义的 offline→online 噪声。
   */
  private readonly pendingTransitions = new Map<
    number,
    ReturnType<typeof setTimeout>
  >();
  private readonly debounceMs: number;

  constructor(
    private readonly clients: ClientRegistry,
    private readonly nodeId: string,
    private readonly devicePresenceTtlSeconds: number,
    private readonly dispatchToUser: (
      userId: number | string,
      data: PresenceChangedMessage | PresenceSnapshotMessage
    ) => Promise<unknown>
  ) {
    this.subscriptions = new PresenceSubscriptionManager(
      config.presence.subscriptionDeviceTtlSeconds
    );
    this.debounceMs = config.presence.transitionDebounceMs;
  }

  async registerPresence(client: Client) {
    try {
      await redis.hset(
        this.getDeviceRegistryKey(client.userId),
        client.deviceId,
        this.nodeId
      );
      await redis.expire(
        this.getDeviceRegistryKey(client.userId),
        24 * 60 * 60
      );
      await redis.set(
        this.getDevicePresenceKey(client.userId, client.deviceId),
        this.nodeId,
        "EX",
        this.devicePresenceTtlSeconds
      );
    } catch (error) {
      logger.warn(
        { err: error, userId: client.userId },
        "Failed to register websocket presence"
      );
    }
  }

  async refreshPresence(client: Client) {
    try {
      await redis.hset(
        this.getDeviceRegistryKey(client.userId),
        client.deviceId,
        this.nodeId
      );
      await redis.expire(
        this.getDeviceRegistryKey(client.userId),
        24 * 60 * 60
      );
      await redis.set(
        this.getDevicePresenceKey(client.userId, client.deviceId),
        this.nodeId,
        "EX",
        this.devicePresenceTtlSeconds
      );
    } catch (error) {
      logger.warn(
        { err: error, userId: client.userId },
        "Failed to refresh websocket presence"
      );
    }
  }

  /**
   * 注销一个 device 的 ws 连接。
   *
   * 幂等性保障：
   *   并发场景（如主动 disconnect + 旧 socket 的 close 事件几乎同时触发）下，
   *   通过"在任何 await 之前先抢占 map 槽位"的策略，确保 Redis hincrby/hdel 等
   *   清理操作只会被执行一次。具体做法：
   *     - 默认模式（不传 options.client）：从 map 中读出 client，并**立即**
   *       activeClients.delete(deviceId)。如果 delete 返回 false，说明已被
   *       其他并发调用抢走，直接 return。
   *     - 显式 client 模式（options.client 由调用方提供）：用于"调用方已先把
   *       map 中的 entry 删掉了"（例如重连覆盖时）的场景，仍需我们清理 Redis。
   *       此时只会清理传入 client 的 Redis 痕迹，不影响 map 里可能存在的"新"client。
   */
  async unregisterClient(
    userId: number,
    deviceId: string,
    options?: { logMessage?: string; client?: Client }
  ) {
    const activeClients = this.clients.get(String(userId));
    let client: Client | undefined = options?.client;

    if (client) {
      // 显式 client 模式：仅在 map 中该 deviceId 仍指向同一 client 时才 delete。
      // 若已被新连接覆盖，map 里的是新 client，不能动；但旧 client 的 Redis 痕迹
      // 仍由本次调用负责清理。
      if (activeClients?.get(deviceId) === client) {
        activeClients.delete(deviceId);
      }
    } else {
      // 默认模式：抢占式 delete 作为占用权获取。
      const existing = activeClients?.get(deviceId);
      if (!activeClients || !existing) {
        return;
      }
      const removed = activeClients.delete(deviceId);
      if (!removed) {
        // 极小窗口：被并发调用抢先 delete。直接返回，避免重复清理 Redis。
        return;
      }
      client = existing;
    }

    if (activeClients && activeClients.size === 0) {
      this.clients.delete(String(userId));
    }

    if (options?.logMessage) {
      logger.info(options.logMessage);
    }

    // 注意：getPresenceSummary 在 delete 之后调用是安全的。
    // 对于"最后一个 device 下线"场景：此时 local 已为 0，但 remote (Redis devices) 尚未清理，
    // 计算出的 is_online 仍为 true，与"删除前"的真实 prev 一致；
    // flushPresenceTransition 内部会再算一次 next，那时 Redis 已清理，next=false，正确广播。
    const previousPresence = await this.getPresenceSummary(client.userId);

    try {
      await redis.hdel(this.getDeviceRegistryKey(client.userId), deviceId);
      await redis.del(this.getDevicePresenceKey(client.userId, deviceId));
    } catch (error) {
      logger.warn(
        { err: error, userId: client.userId },
        "Failed to unregister websocket presence"
      );
    }

    void this.broadcastPresenceTransition(
      client.userId,
      previousPresence.is_online
    );

    // 拆除该 device 的 presence 订阅，避免无效条目堆积。
    // 主动断开 / 异常关闭都会走这里；TTL 是兜底，主动清理更及时。
    void this.subscriptions.cleanupClient(client.userId, deviceId);
  }

  /**
   * 计算某用户的 presence 概要。
   *
   * 单一可信源 = Redis（每个 device 的短 TTL `presence` key）。
   * 不再读取本地 `clients` map：本地 map 中的 socket 可能因半开 TCP / FD 泄漏 / 计数泄漏
   * 等历史故障与 Redis 不一致，那会导致"已退出账号但 header 仍显示在线"等 ghost 现象。
   * 心跳每 ~35s 刷新一次 device presence key（TTL 70s），关闭流程会主动 del；
   * 网络中断 / 进程崩溃情况下 TTL 兜底自动清理，最坏延迟 ~70s 收敛到正确状态。
   *
   * 返回 `observed_at` = 服务端计算时刻；客户端用其做单调性保护，避免乱序覆盖。
   */
  async getPresenceSummary(userId: number) {
    const onlineDeviceIds = await this.getOnlineDeviceIds(userId);
    const latestActivity = await UserDeviceRepository.listLatestActivityByUsers(
      [userId]
    );

    return {
      is_online: onlineDeviceIds.length > 0,
      active_device_count: onlineDeviceIds.length,
      last_active_at: latestActivity[0]?.last_active_at?.toISOString(),
      observed_at: new Date().toISOString()
    };
  }

  /**
   * 列出某用户当前在线 device。
   *
   * 实现：以 `ws:user:{uid}:devices` 注册表（24h TTL，长存）为候选集，
   * 对每个 deviceId 检查其短 TTL 的 `device:{did}:presence` 是否仍存在；
   *   - 存在 ⇒ 在线
   *   - 不存在 ⇒ 视为离线，并惰性 hdel 清理候选集（多节点环境下只清自己看到的 stale 项是安全的：
   *     若另一节点上该 device 仍在线，它会在下一次心跳重新 hset 注册回来）
   *
   * 注意：这里完全不依赖本地 `clients` map，避免历史故障造成的"map 与 Redis 不一致"
   * 直接污染 is_online 判定。
   */
  async getOnlineDeviceIds(userId: number) {
    const candidateDeviceIds = await redis
      .hkeys(this.getDeviceRegistryKey(userId))
      .catch(() => [] as string[]);

    if (candidateDeviceIds.length === 0) {
      return [];
    }

    const presenceChecks = await Promise.all(
      candidateDeviceIds.map(async deviceId => ({
        deviceId,
        exists:
          (await redis
            .exists(this.getDevicePresenceKey(userId, deviceId))
            .catch(() => 0)) > 0
      }))
    );

    const onlineIds: string[] = [];
    const staleIds: string[] = [];
    for (const result of presenceChecks) {
      if (result.exists) {
        onlineIds.push(result.deviceId);
      } else {
        staleIds.push(result.deviceId);
      }
    }

    // 惰性 GC：清理 devices 注册表中已经无短 TTL presence 撑腰的 stale 候选，
    // 避免它们持续参与下一次扫描浪费 round-trip。失败仅记日志，下次扫描会再试。
    if (staleIds.length > 0) {
      redis
        .hdel(this.getDeviceRegistryKey(userId), ...staleIds)
        .catch(error => {
          logger.warn(
            { err: error, userId, staleIds },
            "Failed to garbage-collect stale device registry entries"
          );
        });
    }

    return onlineIds;
  }

  /**
   * 集群级在线判定：是否有任意 device 处于"短 TTL presence 仍有效"状态。
   *
   * 与 `getOnlineDeviceIds` 共用底层数据源（`ws:user:{uid}:devices` + 短 TTL
   * presence key），但在发现首个在线 device 后立即短路返回，避免对长设备列表
   * 的全量 EXISTS 扇出。专为 outbox "多节点重连窗口" 路径设计：
   *   - 本节点 dispatchToUser 返回 localDeliveredCount === 0 时，
   *     需要区分"全集群离线"（真要走重试）和"远程节点已直投"
   *     （pub/sub 已 fan-out，应直接 markDispatched，避免重复投递）。
   *   - 单节点模式下，presence Redis 数据本就只有本节点写入，等价于
   *     localDeliveredCount > 0 判定，无副作用。
   */
  async hasAnyOnlineDevice(userId: number): Promise<boolean> {
    const candidateDeviceIds = await redis
      .hkeys(this.getDeviceRegistryKey(userId))
      .catch(() => [] as string[]);
    if (candidateDeviceIds.length === 0) {
      return false;
    }
    for (const deviceId of candidateDeviceIds) {
      const exists = await redis
        .exists(this.getDevicePresenceKey(userId, deviceId))
        .catch(() => 0);
      if (exists > 0) {
        return true;
      }
    }
    return false;
  }

  private getDeviceRegistryKey(userId: number) {
    return `ws:user:${userId}:devices`;
  }

  private getDevicePresenceKey(userId: number, deviceId: string) {
    return `ws:user:${userId}:device:${deviceId}:presence`;
  }

  /**
   * 计算 presence 推送目标。
   *
   * 早期实现仅查询 `ContactRepository.listContacts(userId)`，即"被广播者本人保存的联系人"。
   * 这种"单向"模型在 A 把 B 加为联系人但 B 没把 A 加为联系人时会漏推，
   * 导致 A 的客户端无法感知 B 的上下线变化。
   *
   * P1 改为 contacts union（forward ∪ reverse）解决"加好友未对称"。
   * P2 引入按需订阅：客户端进入会话/列表时显式 subscribe，服务端按订阅集精准推送。
   *
   * 通过 `config.presence.fanoutMode` 控制扇出策略：
   *  - "contacts":    仅 contacts union（兼容老客户端、订阅链路异常时的兜底）
   *  - "subscribers": 仅订阅集合（最优，最终目标）
   *  - "both":        两者并集（默认，灰度期使用，保证不漏推）
   */
  private async listPresenceSubscriberIds(userId: number) {
    const mode = config.presence.fanoutMode;
    const merged = new Set<number>();

    const tasks: Array<Promise<void>> = [];

    if (mode === "contacts" || mode === "both") {
      tasks.push(
        (async () => {
          const [forward, reverse] = await Promise.all([
            ContactRepository.listContacts(userId),
            ContactRepository.listReverseContactOwners(userId)
          ]);
          for (const item of forward) {
            const id = Number(item.user_id);
            if (Number.isFinite(id) && id > 0) merged.add(id);
          }
          for (const id of reverse) {
            const numeric = Number(id);
            if (Number.isFinite(numeric) && numeric > 0) merged.add(numeric);
          }
        })()
      );
    }

    if (mode === "subscribers" || mode === "both") {
      tasks.push(
        (async () => {
          const subs = await this.subscriptions.listSubscribers(userId);
          for (const id of subs) {
            if (Number.isFinite(id) && id > 0) merged.add(id);
          }
        })()
      );
    }

    await Promise.all(tasks);
    // 不应推送给自己
    merged.delete(userId);
    return Array.from(merged);
  }

  async broadcastPresenceTransition(userId: number, previousOnline: boolean) {
    // P3.4 debounce：短时间多次 transition 合并为最后一次 flush。
    // 注意：previousOnline 取首次进入 debounce 窗口时的值（更接近"上次稳定状态"），
    // 这样可以正确合并 online→offline→online 这类瞬变（首次 previousOnline=true，
    // flush 时 next.is_online=true，equal 不推送，符合预期）。
    if (this.debounceMs <= 0) {
      await this.flushPresenceTransition(userId, previousOnline);
      return;
    }

    const existing = this.pendingTransitions.get(userId);
    if (existing) {
      // 已经有 pending；保留首次的 previousOnline，仅刷新 timer
      clearTimeout(existing);
    }
    const timer = setTimeout(() => {
      this.pendingTransitions.delete(userId);
      void this.flushPresenceTransition(userId, previousOnline).catch(error => {
        logger.warn(
          { err: error, userId },
          "Failed to flush debounced presence transition"
        );
      });
    }, this.debounceMs) as ReturnType<typeof setTimeout> & {
      unref?: () => void;
    };
    // node 环境下 timer.unref 避免阻塞退出
    if (typeof timer.unref === "function") {
      timer.unref();
    }
    this.pendingTransitions.set(userId, timer);
  }

  private async flushPresenceTransition(
    userId: number,
    previousOnline: boolean
  ) {
    try {
      const nextPresence = await this.getPresenceSummary(userId);
      if (nextPresence.is_online === previousOnline) {
        return;
      }

      const subscriberIds = await this.listPresenceSubscriberIds(userId);
      if (subscriberIds.length === 0) {
        return;
      }

      // P3.2/P3.3：按每个订阅者（viewer）应用 visibility + 模糊化。
      // 不同 viewer 看到的可见性可能不同（互为联系人 vs 单向 vs 陌生），
      // 因此 payload 必须 per-viewer 构造。
      // 这里用 target 视角的批量函数：一次 flush 只跑 3 条 SQL，避免 3N round-trips。
      const ctx = await loadPresenceVisibilityForBroadcast(
        userId,
        subscriberIds
      );
      await Promise.allSettled(
        subscriberIds.map(async viewerUserId => {
          const filtered = ctx.evaluate(
            viewerUserId,
            {
              is_online: nextPresence.is_online,
              active_device_count: nextPresence.active_device_count,
              last_active_at: nextPresence.last_active_at
            },
            // P3.7 反例修正：transition 是实时事件（viewer 上一秒还看到"在线"），
            // 把刚下线时刻桶化到 5min 边界既无隐私收益、又会让 client 显示
            // "5 分钟前活跃"等突兀文案。snapshot/HTTP 路径仍保留桶化。
            { skipBucketize: true }
          );
          const payload: PresenceChangedMessage = {
            messageClassify: "presence",
            user_id: userId,
            is_online: filtered.is_online,
            active_device_count: filtered.active_device_count,
            last_active_at: filtered.last_active_at,
            // 透传服务端观测时刻：客户端按 observed_at 单调性丢弃乱序覆盖。
            observed_at: nextPresence.observed_at,
            timestamp: new Date().toISOString()
          };
          return this.dispatchToUser(viewerUserId, payload);
        })
      );
    } catch (error) {
      logger.warn(
        { err: error, userId },
        "Failed to broadcast presence transition"
      );
    }
  }

  /**
   * 构造一批 user 的 presence snapshot，用于客户端 subscribe 后立即回推。
   * P3.2/P3.3：按 viewer 视角应用 visibility 过滤 + last_active_at 模糊化。
   */
  async buildPresenceSnapshot(
    viewerUserId: number,
    userIds: number[]
  ): Promise<PresenceSnapshotMessage> {
    const unique = Array.from(
      new Set(
        userIds
          .map(id => Number(id))
          .filter(id => Number.isFinite(id) && id > 0)
      )
    );
    const ctx = await loadPresenceVisibilityContext(viewerUserId, unique);
    const entries = await Promise.all(
      unique.map(async userId => {
        const summary = await this.getPresenceSummary(userId);
        const filtered = ctx.evaluate(userId, {
          is_online: summary.is_online,
          active_device_count: summary.active_device_count,
          last_active_at: summary.last_active_at
        });
        return {
          user_id: userId,
          is_online: filtered.is_online,
          active_device_count: filtered.active_device_count,
          last_active_at: filtered.last_active_at,
          // 透传服务端观测时刻：snapshot 与后续 transition 之间也需单调性。
          observed_at: summary.observed_at
        };
      })
    );
    return {
      messageClassify: "presence.snapshot",
      entries,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 启动期对账：清理本节点遗留在 Redis 的 stale device 注册项。
   *
   * 触发场景：进程崩溃 / kill -9 / 部署热重启 等导致 unregister 没有跑完的情形。
   * 这些场景会在 `ws:user:{uid}:devices` 中残留映射到本节点的 device 项，
   * 进而让 `getOnlineDeviceIds` 返回 ghost device。
   *
   * 安全性（多节点环境）：
   *   - 仅清理 `ws:user:*:devices` 中 value === 当前 nodeId 的 device。其他节点拥有的 device 不动。
   *   - 使用 SCAN（非 KEYS）流式遍历，避免大 keyspace 下阻塞 Redis。
   *
   * 并发安全（与活跃流量并发）：
   *   - reconcile 与 server.listen() 并发执行；启动期可能已经接到新连接。
   *   - 对每个 candidate device，先校验其短 TTL `presence` key 是否仍存在：
   *       * exists=1 表示该 device 处于活跃心跳维护中，是新近注册的连接，跳过。
   *       * exists=0 才视作 ghost，从 devices hash 移除。
   *   - 这样不会误删正在工作的新连接；同时保留对真正残留项的清理能力。
   */
  async reconcileNodeCounter(): Promise<void> {
    const startedAt = Date.now();
    let cursor = "0";
    let scannedUsers = 0;
    let cleanedDevices = 0;
    try {
      do {
        const [next, keys] = await redis.scan(
          cursor,
          "MATCH",
          "ws:user:*:devices",
          "COUNT",
          200
        );
        cursor = next;
        for (const devicesKey of keys) {
          scannedUsers++;
          // 提取 userId（key 形如 ws:user:{uid}:devices）
          const match = devicesKey.match(/^ws:user:(\d+):devices$/);
          if (!match) continue;
          const userId = Number(match[1]);
          if (!Number.isFinite(userId) || userId <= 0) continue;

          const entries = await redis.hgetall(devicesKey).catch(() => ({}));
          const myDeviceIds = Object.entries(entries)
            .filter(([, nodeId]) => nodeId === this.nodeId)
            .map(([deviceId]) => deviceId);
          if (myDeviceIds.length === 0) continue;

          // 守卫：candidate device 的短 TTL presence key 仍存在 ⇒ 活跃新连接，不动。
          // 仅 exists=0 才视作 ghost，从 devices hash 中移除。
          const aliveChecks = await Promise.all(
            myDeviceIds.map(async deviceId => {
              const exists = await redis
                .exists(this.getDevicePresenceKey(userId, deviceId))
                .catch(() => 0);
              return { deviceId, alive: exists > 0 };
            })
          );
          const ghostDeviceIds = aliveChecks
            .filter(r => !r.alive)
            .map(r => r.deviceId);
          if (ghostDeviceIds.length === 0) continue;

          await redis.hdel(devicesKey, ...ghostDeviceIds).catch(() => 0);
          cleanedDevices += ghostDeviceIds.length;

          // 幂等兜底：清理这些 ghost device 的短 TTL presence key（多数已过期，仍 del 一次更稳）
          await Promise.all(
            ghostDeviceIds.map(deviceId =>
              redis
                .del(this.getDevicePresenceKey(userId, deviceId))
                .catch(() => 0)
            )
          );
        }
      } while (cursor !== "0");

      logger.info(
        {
          nodeId: this.nodeId,
          scannedUsers,
          cleanedDevices,
          elapsedMs: Date.now() - startedAt
        },
        "Reconciled stale presence devices for this node"
      );
    } catch (error) {
      logger.warn(
        { err: error, nodeId: this.nodeId },
        "Failed to reconcile presence devices at startup; ghost-online may persist until TTL expiry"
      );
    }
  }
}
