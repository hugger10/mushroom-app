import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const workerModule = require("../dist/server/src/outbox/outbox_worker.js");

/**
 * 验证 outbox 的"重连窗口"语义：
 *   - 实时投递事件（chat.message.deliver / conversation.read 等）在
 *     deliveredCount === 0 时应被识别，由 worker 走短延迟重试；
 *   - 非实时事件（push.notification / attachment.delete）不参与重连窗口。
 *
 * isRealtimeDeliveryEvent 是 OutboxWorker 暴露的纯静态判定函数，
 * 这里直接黑盒测试集合成员。
 */

test("isRealtimeDeliveryEvent recognises chat dispatch events", () => {
  const exported = workerModule;
  // OutboxWorker 默认只 export 单例，但其原型链上有 static 方法。
  // 通过 default 单例的构造函数访问。
  const ctor = exported.default?.constructor ?? exported.OutboxWorker;
  assert.ok(
    ctor && typeof ctor.isRealtimeDeliveryEvent === "function",
    "OutboxWorker should expose static isRealtimeDeliveryEvent"
  );

  for (const eventType of [
    "chat.message.deliver",
    "conversation.read",
    "conversation.sync",
    "contact.changed",
    "message.recall",
    "message.reaction"
  ]) {
    assert.equal(
      ctor.isRealtimeDeliveryEvent(eventType),
      true,
      `${eventType} must be treated as realtime`
    );
  }
});

test("isRealtimeDeliveryEvent excludes non-realtime events", () => {
  const exported = workerModule;
  const ctor = exported.default?.constructor ?? exported.OutboxWorker;
  for (const eventType of [
    "push.notification",
    "attachment.delete",
    "unknown.type"
  ]) {
    assert.equal(
      ctor.isRealtimeDeliveryEvent(eventType),
      false,
      `${eventType} must NOT be treated as realtime`
    );
  }
});
