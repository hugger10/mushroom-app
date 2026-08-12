import test from "node:test";
import assert from "node:assert/strict";
import { PresenceSubscriber } from "../dist/index.mjs";

/**
 * Build a stub realtime adapter for test. Records all sent frames and exposes
 * controls to simulate connection state changes / inbound messages.
 */
function buildAdapter({ initiallyConnected = true } = {}) {
  const sent = [];
  const messageListeners = new Set();
  const reconnectListeners = new Set();
  let connected = initiallyConnected;

  return {
    sent,
    setConnected(value) {
      connected = value;
    },
    triggerReconnected() {
      for (const listener of reconnectListeners) listener();
    },
    triggerMessage(message) {
      for (const listener of messageListeners) listener(message);
    },
    adapter: {
      send(message) {
        sent.push(message);
      },
      onMessage(listener) {
        messageListeners.add(listener);
        return () => messageListeners.delete(listener);
      },
      onReconnected(listener) {
        reconnectListeners.add(listener);
        return () => reconnectListeners.delete(listener);
      },
      isConnected() {
        return connected;
      }
    }
  };
}

test("syncConversation diffs against current active set", () => {
  const ctx = buildAdapter();
  const sub = new PresenceSubscriber(ctx.adapter);

  sub.syncConversation(101);
  assert.deepEqual(ctx.sent, [
    {
      messageClassify: "presence.subscribe",
      user_ids: [101],
      scope: "conversation"
    }
  ]);

  // 切换到另一个 peer：旧的应 unsubscribe，新的 subscribe
  sub.syncConversation(202);
  assert.deepEqual(ctx.sent.slice(1), [
    {
      messageClassify: "presence.subscribe",
      user_ids: [202],
      scope: "conversation"
    },
    {
      messageClassify: "presence.unsubscribe",
      user_ids: [101],
      scope: "conversation"
    }
  ]);

  sub.syncConversation(null);
  assert.equal(ctx.sent.at(-1).messageClassify, "presence.unsubscribe");
  sub.dispose();
});

test("syncList only diffs the changed peers", () => {
  const ctx = buildAdapter();
  const sub = new PresenceSubscriber(ctx.adapter);

  sub.syncList([1, 2, 3]);
  assert.deepEqual(ctx.sent[0], {
    messageClassify: "presence.subscribe",
    user_ids: [1, 2, 3],
    scope: "list"
  });

  ctx.sent.length = 0;
  // 部分变化：移除 2、新增 4
  sub.syncList([1, 3, 4]);
  // 期待先 add [4] 再 remove [2]
  const adds = ctx.sent.find(m => m.messageClassify === "presence.subscribe");
  const removes = ctx.sent.find(
    m => m.messageClassify === "presence.unsubscribe"
  );
  assert.deepEqual(adds.user_ids, [4]);
  assert.deepEqual(removes.user_ids, [2]);
  sub.dispose();
});

test("scope union deduplicates across conversation + list", () => {
  const ctx = buildAdapter();
  const sub = new PresenceSubscriber(ctx.adapter);

  sub.syncList([10, 20]);
  ctx.sent.length = 0;
  // conversation peer 已在 list 中，应不再发 subscribe
  sub.syncConversation(10);
  assert.equal(ctx.sent.length, 0);

  // 移除 list 中的 10：仍然在 conversation scope -> 不应发 unsubscribe
  sub.syncList([20]);
  assert.equal(ctx.sent.length, 0);

  // 同时清空 conversation：此时 union 不再包含 10 -> 发 unsubscribe
  sub.syncConversation(null);
  assert.equal(ctx.sent.length, 1);
  assert.equal(ctx.sent[0].messageClassify, "presence.unsubscribe");
  assert.deepEqual(ctx.sent[0].user_ids, [10]);
  sub.dispose();
});

test("buffers sends when disconnected and re-emits full active set on reconnect", () => {
  const ctx = buildAdapter({ initiallyConnected: false });
  const sub = new PresenceSubscriber(ctx.adapter);

  sub.syncList([1, 2, 3]);
  // 未连接 -> 不应实际发送
  assert.equal(ctx.sent.length, 0);

  // 连接恢复并触发 onReconnected
  ctx.setConnected(true);
  ctx.triggerReconnected();
  assert.equal(ctx.sent.length, 1);
  assert.equal(ctx.sent[0].messageClassify, "presence.subscribe");
  assert.deepEqual(
    ctx.sent[0].user_ids.sort((a, b) => a - b),
    [1, 2, 3]
  );
  sub.dispose();
});

test("filters non-positive / NaN ids", () => {
  const ctx = buildAdapter();
  const sub = new PresenceSubscriber(ctx.adapter);

  sub.syncList([0, -1, NaN, "abc", 5]);
  assert.deepEqual(ctx.sent[0].user_ids, [5]);
  sub.dispose();
});

test("dispose unsubscribes all and stops further sends", () => {
  const ctx = buildAdapter();
  const sub = new PresenceSubscriber(ctx.adapter);

  sub.syncList([1, 2]);
  ctx.sent.length = 0;
  sub.dispose();
  assert.equal(ctx.sent.length, 1);
  assert.equal(ctx.sent[0].messageClassify, "presence.unsubscribe");
  assert.deepEqual(
    ctx.sent[0].user_ids.sort((a, b) => a - b),
    [1, 2]
  );

  sub.syncList([3]);
  assert.equal(ctx.sent.length, 1, "dispose 后应不再发送");
});

test("store adapter receives presence and presence.snapshot frames", () => {
  const ctx = buildAdapter();
  const changedFrames = [];
  const snapshotFrames = [];
  const sub = new PresenceSubscriber(ctx.adapter, {
    applyChanged(message) {
      changedFrames.push(message);
    },
    applySnapshot(message) {
      snapshotFrames.push(message);
    }
  });

  ctx.triggerMessage({
    messageClassify: "presence",
    user_id: 1,
    is_online: true,
    active_device_count: 1,
    timestamp: "now"
  });
  ctx.triggerMessage({
    messageClassify: "presence.snapshot",
    entries: [{ user_id: 2, is_online: false, active_device_count: 0 }],
    timestamp: "now"
  });
  ctx.triggerMessage({ messageClassify: "pong" });

  assert.equal(changedFrames.length, 1);
  assert.equal(snapshotFrames.length, 1);
  sub.dispose();
});
