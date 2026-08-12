import Redis, { type RedisOptions } from "ioredis";
import { config } from "../utils/config";
import logger from "../utils/logger";

/**
 * 是否运行在测试环境。
 * 同时识别：
 *   1. NODE_ENV === "test"（标准做法）
 *   2. `node --test` 显式参数（CI/本地直接跑 node --test 时 NODE_ENV 可能未设置）
 * 测试环境下：
 *   - retryStrategy 立即放弃，避免后台无限重连污染 node:test 报告；
 *   - error 事件不输出 warn 日志，避免 monkey-patch 桩制造的报错刷屏。
 */
const isTestEnv =
  process.env.NODE_ENV === "test" ||
  process.execArgv.includes("--test") ||
  process.argv.includes("--test");

type ClientRole = "default" | "subscriber";

/**
 * 注册表：跟踪本模块创建的全部 client，便于优雅关闭。
 */
const managedClients = new Set<Redis>();

function bindLifecycleEvents(client: Redis, name: string): void {
  client.on("connect", () => {
    if (!isTestEnv) {
      logger.info({ client: name }, "Redis socket connected");
    }
  });
  client.on("ready", () => {
    if (!isTestEnv) {
      logger.info({ client: name }, "Redis ready");
    }
  });
  client.on("error", error => {
    if (!isTestEnv) {
      logger.warn({ err: error, client: name }, "Redis client error");
    }
  });
  client.on("close", () => {
    if (!isTestEnv) {
      logger.warn({ client: name }, "Redis connection closed");
    }
  });
  client.on("reconnecting", (delayMs: number) => {
    if (!isTestEnv) {
      logger.warn({ client: name, delayMs }, "Redis reconnecting");
    }
  });
  client.on("end", () => {
    if (!isTestEnv) {
      logger.info({ client: name }, "Redis connection ended");
    }
  });
}

/**
 * 按角色生成 ioredis 连接配置。
 *
 * 普通命令连接（default）：
 *   - 启用 ready check，确保连接进入 ready 后才下发命令；
 *   - maxRetriesPerRequest = 20，防止 Redis 不可用时命令在客户端无限堆积。
 *
 * pub/sub 订阅连接（subscriber）：
 *   - 关闭 ready check（ioredis 官方建议，避免订阅恢复延迟）；
 *   - maxRetriesPerRequest = null（必需），否则长连 SUBSCRIBE 会在长时间断连后
 *     被 MaxRetriesPerRequestError 中断，恢复后不会自动恢复订阅。
 */
function buildOptions(role: ClientRole): RedisOptions {
  const base: RedisOptions = {
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    db: config.redis.db,
    lazyConnect: true,
    // 启用 OS 层 TCP keepalive，主动探测半开连接（笔记本休眠 / NAT 超时 /
    // 网络抖动等场景）。ioredis 把该值透传给 Node net.Socket 作为「首次探测
    // 前的空闲延迟（initialDelay）」；后续探测间隔与重试次数由 OS 内核
    // tcp_keepalive_intvl / tcp_keepalive_probes 决定（平台相关）。
    // 配合应用层 PING（subscriber 心跳，参见 redis_dispatcher）形成双保险：
    // 前者由内核探测、后者由业务定时主动 PING。
    keepAlive: 30_000,
    retryStrategy: isTestEnv
      ? () => null
      : times => Math.min(times * 50, 2_000),
    // 主从切换或只读副本切换时，遇到 READONLY 错误立即重连到新的主。
    reconnectOnError: err => err.message.includes("READONLY")
  };

  if (role === "subscriber") {
    return {
      ...base,
      enableReadyCheck: false,
      maxRetriesPerRequest: null
    };
  }

  return {
    ...base,
    enableReadyCheck: true,
    maxRetriesPerRequest: 20
  };
}

function buildClient(role: ClientRole, name: string): Redis {
  const client = new Redis(buildOptions(role));
  bindLifecycleEvents(client, name);
  managedClients.add(client);
  return client;
}

/**
 * 创建一个用于普通命令（get/set/hset/publish/...）的 Redis client。
 *
 * 适用场景：
 *   - 主缓存连接（通过 getRedis() 获取单例）；
 *   - 需要独占连接但仍执行普通命令的场景，例如 publish 端。
 *
 * 注意：pub/sub 的 subscriber **不要** 使用本函数，请用 createSubscriber()，
 * 否则 maxRetriesPerRequest 会让长连 SUBSCRIBE 在 Redis 长时间不可用时被中断。
 *
 * @param name 仅用于事件日志区分多个 client，不影响连接行为。
 */
export function createRedisClient(name = "default"): Redis {
  return buildClient("default", name);
}

/**
 * 创建一个 pub/sub 订阅专用连接。
 *
 * ioredis 硬性约束：一旦该连接执行了 SUBSCRIBE / PSUBSCRIBE，就不能再执行普通命令，
 * 因此订阅者必须独占连接。本函数返回的 client 已按 ioredis 官方建议配置：
 *   - enableReadyCheck: false
 *   - maxRetriesPerRequest: null
 *
 * @param name 仅用于事件日志区分多个 subscriber，不影响连接行为。
 */
export function createSubscriber(name = "subscriber"): Redis {
  return buildClient("subscriber", name);
}

let mainClient: Redis | null = null;

/**
 * 获取主 Redis 单例（懒初始化）。
 *
 * Node.js 进程内一个 Redis client 即一条带 pipelining 的 TCP 长连接，
 * 已经能承载本服务的全部普通命令吞吐。pub/sub 订阅者请使用 createSubscriber()
 * 独占新连接，不要复用本单例。
 */
export function getRedis(): Redis {
  if (!mainClient) {
    mainClient = createRedisClient("main");
  }
  return mainClient;
}

/**
 * 同步查询主 Redis 单例是否处于 ready 状态。
 *
 * 用于 /healthz 等热路径运维接口，避免每次都发一次 PING 增加 RTT。
 * 返回 false 表示：
 *   - 主单例尚未懒初始化；或
 *   - 正在 connecting / reconnecting / end / 已断开。
 */
export function isRedisReady(): boolean {
  return mainClient?.status === "ready";
}

/**
 * 优雅关闭本模块创建的全部 Redis client。
 * 在进程 SIGTERM / SIGINT 时由启动入口调用。
 *
 * 实现细节：先快照、await 关闭、最后再 clear()，避免关闭期间并发创建的新 client
 * 因 managedClients 已被清空而逃逸出本次关停。
 */
export async function closeAllRedis(): Promise<void> {
  const clients = Array.from(managedClients);
  await Promise.allSettled(
    clients.map(async client => {
      try {
        if (client.status !== "end") {
          await client.quit();
        }
      } catch (error) {
        if (!isTestEnv) {
          logger.warn({ err: error }, "Failed to quit Redis client cleanly");
        }
        try {
          client.disconnect();
        } catch {
          /* ignore */
        }
      }
    })
  );
  for (const client of clients) {
    managedClients.delete(client);
  }
  mainClient = null;
}
