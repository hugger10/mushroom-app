import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const workerMod = require("../dist/server/src/outbox/outbox_worker.js");
const repoMod = require("../dist/server/src/repository/outbox_repository.js");
const wsMod = require("../dist/server/src/websocket/index.js");

const worker = workerMod.default;
const OutboxRepository = repoMod.default;
const { wsServer } = wsMod;

/**
 * 多节点回归用例（reviewer Major #1）：
 *   - `dispatchToUser.localDeliveredCount` 仅统计本节点直投，
 *     用户挂在远程节点时本地永远为 0；
 *   - 旧实现会因此进入 2/4/8s 重试窗口，导致 publish 反复广播 →
 *     远程节点重复投递同一条消息（最坏 4x）；
 *   - 修复后 outbox 必须先调 `wsServer.hasAnyOnlineDevice`
 *     做集群级在线判定：任一节点在线 ⇒ markDispatched 不重试。
 *
 * 实现：黑盒 monkey-patch wsServer.dispatchToUser / hasAnyOnlineDevice
 * 与 OutboxRepository.{claimPending, markDispatched, markRetry, markDead}，
 * 直接调用 worker['tick']() 触发一次。
 */

function makeJob(overrides = {}) {
  return {
    id: 1,
    event_type: "chat.message.deliver",
    target_user_id: 42,
    target_device_id: null,
    payload: { messageClassify: "chat", server_conversation_id: 1 },
    retry_count: 0,
    ...overrides
  };
}

function withStubs({ job, dispatch, presenceOnline }, fn) {
  const originalDispatch = wsServer.dispatchToUser.bind(wsServer);
  const originalPresence = wsServer.hasAnyOnlineDevice.bind(wsServer);
  const originalClaim = OutboxRepository.claimPending;
  const originalDispatched = OutboxRepository.markDispatched;
  const originalRetry = OutboxRepository.markRetry;
  const originalDead = OutboxRepository.markDead;
  const calls = {
    dispatched: [],
    retry: [],
    dead: [],
    presenceProbes: 0,
    dispatches: 0
  };
  let claimedOnce = false;
  OutboxRepository.claimPending = async () => {
    if (claimedOnce) return [];
    claimedOnce = true;
    return [job];
  };
  OutboxRepository.markDispatched = async id => {
    calls.dispatched.push(id);
  };
  OutboxRepository.markRetry = async (id, retryCount, nextRetryAt) => {
    calls.retry.push({ id, retryCount, nextRetryAt });
  };
  OutboxRepository.markDead = async (id, retryCount) => {
    calls.dead.push({ id, retryCount });
  };
  wsServer.dispatchToUser = async () => {
    calls.dispatches++;
    return dispatch;
  };
  wsServer.hasAnyOnlineDevice = async () => {
    calls.presenceProbes++;
    return presenceOnline;
  };
  return Promise.resolve(fn(calls)).finally(() => {
    wsServer.dispatchToUser = originalDispatch;
    wsServer.hasAnyOnlineDevice = originalPresence;
    OutboxRepository.claimPending = originalClaim;
    OutboxRepository.markDispatched = originalDispatched;
    OutboxRepository.markRetry = originalRetry;
    OutboxRepository.markDead = originalDead;
  });
}

test("A. local delivered: markDispatched, no presence probe, no retry", async () => {
  await withStubs(
    {
      job: makeJob(),
      dispatch: { localDeliveredCount: 1, mode: "local" },
      presenceOnline: false /* should not be consulted */
    },
    async calls => {
      await worker["tick"]();
      assert.equal(calls.dispatched.length, 1);
      assert.equal(calls.retry.length, 0);
      assert.equal(
        calls.presenceProbes,
        0,
        "presence probe must be skipped when local already delivered"
      );
    }
  );
});

test("B. local=0 but cluster online elsewhere: markDispatched, NO retry (multi-node fix)", async () => {
  await withStubs(
    {
      job: makeJob(),
      dispatch: { localDeliveredCount: 0, mode: "local+broadcast" },
      presenceOnline: true
    },
    async calls => {
      await worker["tick"]();
      assert.equal(calls.presenceProbes, 1);
      assert.equal(
        calls.dispatched.length,
        1,
        "remote-delivered job must be marked dispatched to avoid duplicate publish"
      );
      assert.equal(calls.retry.length, 0);
    }
  );
});

test("C. local=0 and cluster fully offline: enter reconnect window (markRetry attempt 1/3)", async () => {
  await withStubs(
    {
      job: makeJob({ retry_count: 0 }),
      dispatch: { localDeliveredCount: 0, mode: "local" },
      presenceOnline: false
    },
    async calls => {
      await worker["tick"]();
      assert.equal(calls.presenceProbes, 1);
      assert.equal(calls.retry.length, 1);
      assert.equal(calls.retry[0].retryCount, 1);
      assert.equal(calls.dispatched.length, 0);
    }
  );
});

test("D. exceeded reconnect window (retry_count=3): markDispatched as offline fallback", async () => {
  await withStubs(
    {
      job: makeJob({ retry_count: 3 }),
      dispatch: { localDeliveredCount: 0, mode: "local" },
      presenceOnline: false
    },
    async calls => {
      await worker["tick"]();
      assert.equal(calls.retry.length, 0);
      assert.equal(
        calls.dispatched.length,
        1,
        "after reconnect window exceeded, give up & let client syncNow on reconnect"
      );
    }
  );
});

test("E. non-realtime event (push.notification) with deliveredCount=0: markDispatched, no probe, no retry", async () => {
  await withStubs(
    {
      job: makeJob({
        event_type: "push.notification",
        payload: { type: "test" }
      }),
      dispatch: { localDeliveredCount: 0, mode: "skip" },
      presenceOnline: false
    },
    async calls => {
      // push 走的是 PushNotificationService 不是 wsServer，所以替换 dispatchToUser
      // 不影响 —— 这里把 deliverPushNotification 的内部也短路掉，模拟"已尝试推送但无设备"。
      // 直接 patch handler 上的实现：
      const pushMod = require("../dist/server/src/service/push_notification_service.js");
      const originalPush = pushMod.default.deliverToUser;
      pushMod.default.deliverToUser = async () => ({
        delivered: 0,
        mode: "skip"
      });
      try {
        await worker["tick"]();
      } finally {
        pushMod.default.deliverToUser = originalPush;
      }
      assert.equal(
        calls.presenceProbes,
        0,
        "non-realtime event must NOT trigger presence probe"
      );
      assert.equal(
        calls.retry.length,
        0,
        "non-realtime event must NOT enter reconnect window"
      );
      assert.equal(calls.dispatched.length, 1);
    }
  );
});
