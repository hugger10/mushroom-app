import { getRedis } from "../cache/redis";
import logger from "../utils/logger";

const redis = getRedis();

/**
 * 服务端的"按需订阅"在线状态登记。
 *
 * Redis 数据结构：
 *   - presence:subs:{targetUserId}                  Set<string>      who subscribed to target user
 *                                                                    元素格式：`${subscriberUserId}:${deviceId}`
 *   - presence:subs-by:{subscriberUserId}:{deviceId} Set<number>    该 device 当前订阅的 target 集合
 *                                                                    用于断连 / TTL 过期时反查清理
 *   - presence:subs:device:{subscriberUserId}:{deviceId} string      设备订阅活跃标记，TTL 用于自动回收
 *                                                                    心跳时 refresh，过期后由清理脚本/惰性清理移除
 *
 * 设计要点：
 *  1. 订阅集按 (subscriber, device) 颗粒度存储，避免同一用户多端订阅互相覆盖；
 *  2. 单设备 TTL 兜底：客户端崩溃 / 网络断开未发 unsubscribe 时，5 分钟（默认）后自动失效；
 *  3. cleanupClient 在 ws 关闭时调用，立即拆除该设备的所有订阅，无需等 TTL；
 *  4. 所有 Redis 异常 catch + log，不抛出，订阅失败仅退化为"无推送"，不影响业务。
 */
export class PresenceSubscriptionManager {
  constructor(private readonly deviceTtlSeconds: number) {}

  /** 订阅一批 target 用户。返回实际新增（未去重）的条目数。 */
  async subscribe(
    subscriberUserId: number,
    deviceId: string,
    targetUserIds: number[]
  ): Promise<void> {
    const sanitized = this.sanitizeIds(targetUserIds, subscriberUserId);
    if (sanitized.length === 0) {
      await this.touchDeviceTtl(subscriberUserId, deviceId);
      return;
    }

    const member = this.formatSubscriberMember(subscriberUserId, deviceId);
    const byKey = this.getSubsByKey(subscriberUserId, deviceId);

    try {
      const pipeline = redis.pipeline();
      for (const targetId of sanitized) {
        pipeline.sadd(this.getSubsKey(targetId), member);
        // target subs key TTL 24h, 心跳 refresh
        pipeline.expire(this.getSubsKey(targetId), 24 * 60 * 60);
      }
      pipeline.sadd(byKey, ...sanitized.map(id => String(id)));
      pipeline.expire(byKey, this.deviceTtlSeconds);
      pipeline.set(
        this.getDeviceMarkerKey(subscriberUserId, deviceId),
        "1",
        "EX",
        this.deviceTtlSeconds
      );
      await pipeline.exec();
    } catch (error) {
      logger.warn(
        { err: error, subscriberUserId, deviceId },
        "Failed to register presence subscription"
      );
    }
  }

  async unsubscribe(
    subscriberUserId: number,
    deviceId: string,
    targetUserIds: number[]
  ): Promise<void> {
    const sanitized = this.sanitizeIds(targetUserIds, subscriberUserId);
    if (sanitized.length === 0) {
      return;
    }
    const member = this.formatSubscriberMember(subscriberUserId, deviceId);
    const byKey = this.getSubsByKey(subscriberUserId, deviceId);

    try {
      const pipeline = redis.pipeline();
      for (const targetId of sanitized) {
        pipeline.srem(this.getSubsKey(targetId), member);
      }
      pipeline.srem(byKey, ...sanitized.map(id => String(id)));
      await pipeline.exec();
    } catch (error) {
      logger.warn(
        { err: error, subscriberUserId, deviceId },
        "Failed to unregister presence subscription"
      );
    }
  }

  /** 心跳时刷新设备 TTL。 */
  async refreshDeviceTtl(
    subscriberUserId: number,
    deviceId: string
  ): Promise<void> {
    await this.touchDeviceTtl(subscriberUserId, deviceId);
  }

  /** ws 关闭时调用：拆除该 device 的所有订阅。 */
  async cleanupClient(
    subscriberUserId: number,
    deviceId: string
  ): Promise<void> {
    const byKey = this.getSubsByKey(subscriberUserId, deviceId);
    let targets: string[] = [];
    try {
      targets = await redis.smembers(byKey);
    } catch (error) {
      logger.warn(
        { err: error, subscriberUserId, deviceId },
        "Failed to read subscriptions for cleanup"
      );
      return;
    }
    if (targets.length === 0) {
      try {
        await redis.del(
          byKey,
          this.getDeviceMarkerKey(subscriberUserId, deviceId)
        );
      } catch {
        // ignore
      }
      return;
    }

    const member = this.formatSubscriberMember(subscriberUserId, deviceId);
    try {
      const pipeline = redis.pipeline();
      for (const raw of targets) {
        const targetId = Number(raw);
        if (!Number.isFinite(targetId) || targetId <= 0) continue;
        pipeline.srem(this.getSubsKey(targetId), member);
      }
      pipeline.del(byKey, this.getDeviceMarkerKey(subscriberUserId, deviceId));
      await pipeline.exec();
    } catch (error) {
      logger.warn(
        { err: error, subscriberUserId, deviceId },
        "Failed to cleanup presence subscriptions"
      );
    }
  }

  /**
   * 列出 target 用户的订阅者 userId（去重）。
   *
   * 同一用户可能多端订阅 -> Set<userId>；
   * 同时校验 deviceMarker 是否仍存活，惰性回收过期条目。
   */
  async listSubscribers(targetUserId: number): Promise<number[]> {
    let raw: string[] = [];
    try {
      raw = await redis.smembers(this.getSubsKey(targetUserId));
    } catch (error) {
      logger.warn(
        { err: error, targetUserId },
        "Failed to list presence subscribers"
      );
      return [];
    }
    if (raw.length === 0) return [];

    const result = new Set<number>();
    const stale: string[] = [];

    // 并发校验 device marker，剔除已过期的订阅条目
    const checks = await Promise.all(
      raw.map(async member => {
        const parsed = this.parseSubscriberMember(member);
        if (!parsed) {
          stale.push(member);
          return null;
        }
        try {
          const exists = await redis.exists(
            this.getDeviceMarkerKey(parsed.subscriberUserId, parsed.deviceId)
          );
          if (exists === 0) {
            stale.push(member);
            return null;
          }
        } catch {
          // 校验失败时按"仍存活"处理，避免误清理
        }
        return parsed.subscriberUserId;
      })
    );

    for (const id of checks) {
      if (id != null) result.add(id);
    }

    if (stale.length > 0) {
      try {
        await redis.srem(this.getSubsKey(targetUserId), ...stale);
      } catch {
        // ignore
      }
    }

    return Array.from(result);
  }

  private async touchDeviceTtl(subscriberUserId: number, deviceId: string) {
    try {
      const exists = await redis.exists(
        this.getDeviceMarkerKey(subscriberUserId, deviceId)
      );
      if (exists === 0) {
        // 没有任何订阅，跳过
        return;
      }
      await redis
        .multi()
        .expire(
          this.getDeviceMarkerKey(subscriberUserId, deviceId),
          this.deviceTtlSeconds
        )
        .expire(
          this.getSubsByKey(subscriberUserId, deviceId),
          this.deviceTtlSeconds
        )
        .exec();
    } catch (error) {
      logger.warn(
        { err: error, subscriberUserId, deviceId },
        "Failed to refresh presence subscription TTL"
      );
    }
  }

  private sanitizeIds(ids: number[], excludeUserId: number): number[] {
    const seen = new Set<number>();
    for (const raw of ids ?? []) {
      const numeric = Number(raw);
      if (!Number.isFinite(numeric) || numeric <= 0) continue;
      if (numeric === excludeUserId) continue; // 不允许订阅自己
      seen.add(numeric);
    }
    return Array.from(seen);
  }

  private formatSubscriberMember(userId: number, deviceId: string) {
    return `${userId}:${deviceId}`;
  }

  private parseSubscriberMember(
    raw: string
  ): { subscriberUserId: number; deviceId: string } | null {
    const idx = raw.indexOf(":");
    if (idx <= 0) return null;
    const userIdRaw = raw.slice(0, idx);
    const deviceId = raw.slice(idx + 1);
    const userId = Number(userIdRaw);
    if (!Number.isFinite(userId) || userId <= 0 || !deviceId) return null;
    return { subscriberUserId: userId, deviceId };
  }

  private getSubsKey(targetUserId: number) {
    return `presence:subs:${targetUserId}`;
  }

  private getSubsByKey(subscriberUserId: number, deviceId: string) {
    return `presence:subs-by:${subscriberUserId}:${deviceId}`;
  }

  private getDeviceMarkerKey(subscriberUserId: number, deviceId: string) {
    return `presence:subs:device:${subscriberUserId}:${deviceId}`;
  }
}
