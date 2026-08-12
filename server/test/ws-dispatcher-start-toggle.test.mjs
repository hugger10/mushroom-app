import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const dispatcherMod = require("../dist/server/src/websocket/redis_dispatcher.js");
const configMod = require("../dist/server/src/utils/config.js");

const { WebSocketRedisDispatcher } = dispatcherMod;
const { config } = configMod;

/**
 * 验证 reviewer Minor #5：start() 可重入，且在模式切换时正确启停 subscriber。
 *
 * 测试矩阵：
 *   1. single-node start → 不创建 subscriber（status === "disabled"）；
 *   2. 切到 multi-node 后重新 start → 创建 subscriber；
 *   3. 再切回 single-node 后 start → 关停 subscriber；
 *   4. 同模式重复 start → 幂等，subscriber 实例不变。
 */

test("start() is reentrant and reacts to multiNode toggle", async () => {
  const originalMultiNode = config.server.multiNode;
  try {
    config.server.multiNode = false;
    const dispatcher = new WebSocketRedisDispatcher(
      "node-toggle",
      () => 0,
      () => 0
    );

    dispatcher.start();
    assert.equal(
      dispatcher.subscriberStatus,
      "disabled",
      "single-node start must not create subscriber"
    );

    // 幂等：同模式重复 start 不应抛错也不应创建 subscriber
    dispatcher.start();
    assert.equal(dispatcher.subscriberStatus, "disabled");

    // 切到多节点
    config.server.multiNode = true;
    dispatcher.start();
    assert.notEqual(
      dispatcher.subscriberStatus,
      "disabled",
      "multi-node start must create subscriber"
    );

    // 切回单节点：应关停 subscriber
    config.server.multiNode = false;
    dispatcher.start();
    assert.equal(
      dispatcher.subscriberStatus,
      "disabled",
      "toggling back to single-node must tear down subscriber"
    );

    dispatcher.stop();
  } finally {
    config.server.multiNode = originalMultiNode;
  }
});
