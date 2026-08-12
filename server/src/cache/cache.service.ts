import { getRedis } from "./redis";
import logger from "../utils/logger";

/**
 * 全局 key 前缀，避免与其他业务/同一 Redis 实例上的其他应用冲突。
 */
const PREFIX = "mushroom:";

function withPrefix(key: string): string {
  return PREFIX + key;
}

/**
 * 业务层缓存封装：统一前缀 + JSON 序列化 + TTL。
 *
 * 注意：本模块定位为"高层便捷 API"，并不强制替代既有的
 * `redis.hset/publish/...` 这类直接调用——对于 pub/sub、hash、
 * 分布式锁等场景，仍应直接使用 ioredis 原生 API。
 */
export const cache = {
  async get<T>(key: string): Promise<T | null> {
    const raw = await getRedis().get(withPrefix(key));
    if (raw == null) {
      return null;
    }
    try {
      return JSON.parse(raw) as T;
    } catch (error) {
      logger.warn({ err: error, key }, "Failed to parse cached JSON value");
      return null;
    }
  },

  async set<T>(key: string, value: T, ttlSec?: number): Promise<void> {
    const payload = JSON.stringify(value);
    const fullKey = withPrefix(key);
    if (ttlSec && ttlSec > 0) {
      await getRedis().set(fullKey, payload, "EX", ttlSec);
    } else {
      await getRedis().set(fullKey, payload);
    }
  },

  async del(key: string): Promise<number> {
    return getRedis().del(withPrefix(key));
  },

  /**
   * 健康检查：成功返回 true，任何异常返回 false。
   * 供未来 /healthz 等运维接口使用。
   */
  async ping(): Promise<boolean> {
    try {
      const pong = await getRedis().ping();
      return pong === "PONG";
    } catch (error) {
      logger.warn({ err: error }, "Redis ping failed");
      return false;
    }
  }
};
