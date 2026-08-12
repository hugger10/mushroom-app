import test from "node:test";

// 全局测试清理：统一关闭 Redis / pg / WebSocket 句柄，避免事件循环 hang。
// 三类清理彼此独立 try/catch，单点失败不影响其余。
test.after(async () => {
  // 1) 关闭 ioredis 主连接 + 全部 subscriber
  try {
    const redisMod = await import("../dist/server/src/cache/redis.js");
    if (typeof redisMod.closeAllRedis === "function") {
      await redisMod.closeAllRedis();
    }
  } catch {
    /* ignore: module not loaded in this suite */
  }

  // 2) 关闭 WebSocket server（heartbeat timer + wss + redisDispatcher.stop）
  try {
    const wsMod = await import("../dist/server/src/websocket/index.js");
    if (wsMod.wsServer && typeof wsMod.wsServer.close === "function") {
      await wsMod.wsServer.close();
    }
  } catch {
    /* ignore */
  }

  // 3) 关闭 pg-promise 连接池
  try {
    const pgMod = await import("../dist/server/src/db/pg.js");
    const pg = pgMod.default;
    if (pg && pg.$pool && typeof pg.$pool.end === "function") {
      await pg.$pool.end();
    }
  } catch {
    /* ignore */
  }
});
