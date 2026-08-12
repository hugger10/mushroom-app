import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const wsModule = require("../dist/server/src/websocket/index.js");
const configModule = require("../dist/server/src/utils/config.js");
const redisModule = require("../dist/server/src/cache/redis.js");

const { wsServer } = wsModule;
const { config } = configModule;

/**
 * 回归用例（修复"WS 派发依赖 Redis pub/sub 导致 zombie subscriber"问题的核心）：
 *
 *   - 单节点：dispatchToUser 必须只走本地 ws.send，不依赖 Redis publish；
 *     即使 Redis publish 抛错或 subscriber 完全死掉，本地投递照常工作。
 *   - 多节点：本地仍直投，同时 publish 通知其他节点，但本节点的 ws.send
 *     绝不能依赖 publish 是否成功。
 *
 * 实现策略：mock 一个假的 ws client 直接挂到 wsServer.clients map 上，
 * 监控它的 send 是否被调用；同时 mock redis.publish 抛错 / 计数。
 */

function installFakeClient(userId, deviceId, sentSink) {
  const fakeSocket = {
    readyState: 1, // WebSocket.OPEN === 1
    send(payload, cb) {
      sentSink.push(payload);
      if (typeof cb === "function") cb();
    },
    close() {},
    terminate() {}
  };
  const client = {
    id: String(userId),
    userId,
    deviceId,
    isAlive: true,
    socket: fakeSocket,
    lastPingTime: Date.now()
  };
  let userClients = wsServer.clients.get(String(userId));
  if (!userClients) {
    userClients = new Map();
    wsServer.clients.set(String(userId), userClients);
  }
  userClients.set(deviceId, client);
  return () => {
    const map = wsServer.clients.get(String(userId));
    if (map?.get(deviceId) === client) {
      map.delete(deviceId);
      if (map.size === 0) wsServer.clients.delete(String(userId));
    }
  };
}

test("single-node: dispatchToUser delivers locally without touching redis.publish", async () => {
  const originalMultiNode = config.server.multiNode;
  const redis = redisModule.getRedis();
  const originalPublish = redis.publish.bind(redis);
  const sent = [];
  let publishCount = 0;
  redis.publish = async () => {
    publishCount++;
    return 1;
  };
  const cleanup = installFakeClient(9001, "device-A", sent);
  try {
    config.server.multiNode = false;
    const result = await wsServer.dispatchToUser(9001, {
      messageClassify: "test",
      ts: 1
    });
    assert.equal(result.localDeliveredCount, 1);
    assert.equal(result.mode, "local");
    assert.equal(sent.length, 1);
    assert.equal(
      publishCount,
      0,
      "single-node must not publish to redis pub/sub"
    );
  } finally {
    cleanup();
    redis.publish = originalPublish;
    config.server.multiNode = originalMultiNode;
  }
});

test("subscriber-dead scenario: local delivery still works when redis.publish throws", async () => {
  const originalMultiNode = config.server.multiNode;
  const redis = redisModule.getRedis();
  const originalPublish = redis.publish.bind(redis);
  const sent = [];
  redis.publish = async () => {
    throw new Error("redis subscriber dead / publish failed");
  };
  const cleanup = installFakeClient(9002, "device-B", sent);
  try {
    // 即便强制开多节点 + publish 抛错，本地投递仍必须成功 ——
    // 这正是修复 zombie subscriber 黑洞的关键。
    config.server.multiNode = true;
    const result = await wsServer.dispatchToUser(9002, {
      messageClassify: "test",
      ts: 2
    });
    assert.equal(result.localDeliveredCount, 1);
    assert.equal(
      sent.length,
      1,
      "local ws.send must fire even if publish throws"
    );
  } finally {
    cleanup();
    redis.publish = originalPublish;
    config.server.multiNode = originalMultiNode;
  }
});

test("multi-node: dispatchToUser fans out locally AND publishes to peers", async () => {
  const originalMultiNode = config.server.multiNode;
  const redis = redisModule.getRedis();
  const originalPublish = redis.publish.bind(redis);
  const sent = [];
  const published = [];
  redis.publish = async (channel, payload) => {
    published.push({ channel, payload });
    return 1;
  };
  const cleanup = installFakeClient(9003, "device-C", sent);
  try {
    config.server.multiNode = true;
    const result = await wsServer.dispatchToUser(9003, {
      messageClassify: "test",
      ts: 3
    });
    assert.equal(result.localDeliveredCount, 1);
    assert.equal(result.mode, "local+broadcast");
    assert.equal(sent.length, 1);
    // publishOnly 是 fire-and-forget，给一点时间让微任务跑
    await new Promise(r => setImmediate(r));
    await new Promise(r => setImmediate(r));
    assert.equal(published.length, 1);
    assert.equal(published[0].channel, "ws:deliver");
  } finally {
    cleanup();
    redis.publish = originalPublish;
    config.server.multiNode = originalMultiNode;
  }
});

test("dispatchToUser returns localDeliveredCount=0 when target user offline", async () => {
  const originalMultiNode = config.server.multiNode;
  try {
    config.server.multiNode = false;
    const result = await wsServer.dispatchToUser(9999999, {
      messageClassify: "test"
    });
    assert.equal(result.localDeliveredCount, 0);
  } finally {
    config.server.multiNode = originalMultiNode;
  }
});
