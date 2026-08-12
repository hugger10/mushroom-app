import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const dispatcherModule = require("../dist/server/src/websocket/redis_dispatcher.js");
const configModule = require("../dist/server/src/utils/config.js");
const redisModule = require("../dist/server/src/cache/redis.js");

const { WebSocketRedisDispatcher } = dispatcherModule;
const { config } = configModule;

/**
 * 回归用例：本次修复的核心 —— WS 派发的"主路径"必须在所有模式下都先走
 * 本地直投，绝不依赖 Redis pub/sub 这条 fire-and-forget 旁路。
 *
 * 验证：
 *   1. 单节点模式（默认）：publishOnly / publishControlOnly 全部 no-op，
 *      不产生任何 redis.publish 调用；
 *   2. 多节点模式：publishOnly 会调用 redis.publish 把派发广播给其他节点；
 *   3. handleDispatchEvent 收到来自本节点的 envelope 时自跳过，不双投；
 *   4. handleControlEvent 收到来自本节点的 command 时自跳过。
 */

test("single-node mode: publishOnly is a no-op", async () => {
  const originalMultiNode = config.server.multiNode;
  const redis = redisModule.getRedis();
  const originalPublish = redis.publish.bind(redis);
  let publishCalls = 0;
  redis.publish = async () => {
    publishCalls++;
    return 0;
  };
  try {
    config.server.multiNode = false;
    const dispatcher = new WebSocketRedisDispatcher(
      "node-test",
      () => 0,
      () => 0
    );
    await dispatcher.publishOnly(123, { messageClassify: "test" });
    await dispatcher.publishControlOnly(123, { reason: "test" });
    assert.equal(
      publishCalls,
      0,
      "single-node mode must never publish to redis"
    );
  } finally {
    redis.publish = originalPublish;
    config.server.multiNode = originalMultiNode;
  }
});

test("multi-node mode: publishOnly publishes envelope to redis", async () => {
  const originalMultiNode = config.server.multiNode;
  const redis = redisModule.getRedis();
  const originalPublish = redis.publish.bind(redis);
  const published = [];
  redis.publish = async (channel, payload) => {
    published.push({ channel, payload });
    return 1;
  };
  try {
    config.server.multiNode = true;
    const dispatcher = new WebSocketRedisDispatcher(
      "node-A",
      () => 0,
      () => 0
    );
    await dispatcher.publishOnly(42, {
      messageClassify: "presence",
      user_id: 42
    });
    assert.equal(published.length, 1);
    assert.equal(published[0].channel, "ws:deliver");
    const envelope = JSON.parse(published[0].payload);
    assert.equal(envelope.sourceNodeId, "node-A");
    assert.equal(envelope.targetUserId, 42);
    assert.equal(envelope.payload.user_id, 42);
  } finally {
    redis.publish = originalPublish;
    config.server.multiNode = originalMultiNode;
  }
});

test("handleDispatchEvent skips envelopes published by self", () => {
  const originalMultiNode = config.server.multiNode;
  let localCalls = 0;
  const dispatcher = new WebSocketRedisDispatcher(
    "node-A",
    () => {
      localCalls++;
      return 1;
    },
    () => 0
  );
  try {
    config.server.multiNode = true;
    // 模拟 redis 把本节点 publish 的 envelope 推回本节点 —— 必须自跳过
    dispatcher.handleDispatchEvent({
      sourceNodeId: "node-A",
      targetUserId: 1,
      payload: { messageClassify: "test" }
    });
    assert.equal(
      localCalls,
      0,
      "self-published envelopes must be skipped to avoid double delivery"
    );

    // 来自其他节点的 envelope 必须正常处理
    dispatcher.handleDispatchEvent({
      sourceNodeId: "node-B",
      targetUserId: 1,
      payload: { messageClassify: "test" }
    });
    assert.equal(
      localCalls,
      1,
      "envelopes from other nodes should be delivered locally"
    );
  } finally {
    config.server.multiNode = originalMultiNode;
  }
});

test("handleControlEvent skips commands published by self", () => {
  let disconnectCalls = 0;
  const dispatcher = new WebSocketRedisDispatcher(
    "node-A",
    () => 0,
    () => {
      disconnectCalls++;
      return 1;
    }
  );
  dispatcher.handleControlEvent({
    sourceNodeId: "node-A",
    targetUserId: 1,
    reason: "x"
  });
  assert.equal(disconnectCalls, 0);

  dispatcher.handleControlEvent({
    sourceNodeId: "node-B",
    targetUserId: 1,
    reason: "x"
  });
  assert.equal(disconnectCalls, 1);
});

test("subscriberStatus reports 'disabled' when no subscriber attached", () => {
  const dispatcher = new WebSocketRedisDispatcher(
    "node-A",
    () => 0,
    () => 0
  );
  assert.equal(dispatcher.subscriberStatus, "disabled");
});
