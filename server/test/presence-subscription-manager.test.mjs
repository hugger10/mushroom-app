import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const psmModule = require("../dist/server/src/websocket/presence_subscription_manager.js");
const redisModule = require("../dist/server/src/cache/redis.js");

const { PresenceSubscriptionManager } = psmModule;
const redis = redisModule.getRedis();

/**
 * 内存版 Redis stub。仅实现 PresenceSubscriptionManager 用到的命令：
 *   sadd / srem / smembers / expire / set / del / exists / multi / pipeline
 * 通过覆盖 ioredis 实例上的方法把 PresenceSubscriptionManager 隔离到内存中。
 */
function installRedisStub() {
  const sets = new Map(); // key -> Set<string>
  const strings = new Map(); // key -> string

  const original = {};
  for (const m of [
    "sadd",
    "srem",
    "smembers",
    "expire",
    "set",
    "del",
    "exists",
    "multi",
    "pipeline"
  ]) {
    original[m] = redis[m];
  }

  redis.sadd = async (key, ...members) => {
    const set = sets.get(key) ?? new Set();
    for (const m of members) set.add(String(m));
    sets.set(key, set);
    return members.length;
  };
  redis.srem = async (key, ...members) => {
    const set = sets.get(key);
    if (!set) return 0;
    let removed = 0;
    for (const m of members) {
      if (set.delete(String(m))) removed++;
    }
    if (set.size === 0) sets.delete(key);
    return removed;
  };
  redis.smembers = async key => Array.from(sets.get(key) ?? []);
  redis.expire = async () => 1;
  redis.set = async (key, value) => {
    strings.set(key, String(value));
    return "OK";
  };
  redis.del = async (...keys) => {
    let n = 0;
    for (const k of keys) {
      if (sets.delete(k)) n++;
      if (strings.delete(k)) n++;
    }
    return n;
  };
  redis.exists = async key => (sets.has(key) || strings.has(key) ? 1 : 0);

  // multi/pipeline 共用一个简易 chain，调用 .exec() 时一并执行
  function buildChain() {
    const ops = [];
    const chain = {
      sadd: (...args) => {
        ops.push(() => redis.sadd(...args));
        return chain;
      },
      srem: (...args) => {
        ops.push(() => redis.srem(...args));
        return chain;
      },
      expire: (...args) => {
        ops.push(() => redis.expire(...args));
        return chain;
      },
      set: (...args) => {
        ops.push(() => redis.set(...args));
        return chain;
      },
      del: (...args) => {
        ops.push(() => redis.del(...args));
        return chain;
      },
      exec: async () => {
        const out = [];
        for (const fn of ops) {
          out.push([null, await fn()]);
        }
        return out;
      }
    };
    return chain;
  }
  redis.multi = () => buildChain();
  redis.pipeline = () => buildChain();

  return {
    sets,
    strings,
    restore() {
      for (const [k, v] of Object.entries(original)) {
        redis[k] = v;
      }
    },
    reset() {
      sets.clear();
      strings.clear();
    }
  };
}

const stub = installRedisStub();

test.beforeEach(() => {
  stub.reset();
});

test.after(() => {
  stub.restore();
  try {
    redis.disconnect();
  } catch {
    // ignore
  }
});

test("subscribe registers (subscriber:device) member on each target subs key", async () => {
  const manager = new PresenceSubscriptionManager(300);
  await manager.subscribe(7, "device-A", [10, 20]);

  assert.deepEqual(Array.from(stub.sets.get("presence:subs:10") ?? []), [
    "7:device-A"
  ]);
  assert.deepEqual(Array.from(stub.sets.get("presence:subs:20") ?? []), [
    "7:device-A"
  ]);
  assert.deepEqual(
    Array.from(stub.sets.get("presence:subs-by:7:device-A") ?? []).sort(),
    ["10", "20"]
  );
  assert.equal(stub.strings.get("presence:subs:device:7:device-A"), "1");
});

test("subscribe filters self and non-positive ids", async () => {
  const manager = new PresenceSubscriptionManager(300);
  await manager.subscribe(7, "device-A", [7, 0, -1, 11]);
  assert.equal(stub.sets.get("presence:subs:7"), undefined);
  assert.deepEqual(Array.from(stub.sets.get("presence:subs:11") ?? []), [
    "7:device-A"
  ]);
});

test("unsubscribe removes the matching device member", async () => {
  const manager = new PresenceSubscriptionManager(300);
  await manager.subscribe(7, "device-A", [10, 20]);
  await manager.subscribe(8, "device-B", [10]);

  await manager.unsubscribe(7, "device-A", [10]);
  assert.deepEqual(Array.from(stub.sets.get("presence:subs:10") ?? []).sort(), [
    "8:device-B"
  ]);
  // device-A 仍订阅 20
  assert.deepEqual(Array.from(stub.sets.get("presence:subs:20") ?? []), [
    "7:device-A"
  ]);
});

test("listSubscribers returns deduped userIds across multiple devices", async () => {
  const manager = new PresenceSubscriptionManager(300);
  await manager.subscribe(7, "device-A", [10]);
  await manager.subscribe(7, "device-B", [10]);
  await manager.subscribe(8, "device-C", [10]);

  const ids = (await manager.listSubscribers(10)).sort((a, b) => a - b);
  assert.deepEqual(ids, [7, 8]);
});

test("listSubscribers prunes entries whose device marker has expired", async () => {
  const manager = new PresenceSubscriptionManager(300);
  await manager.subscribe(7, "device-A", [10]);
  await manager.subscribe(8, "device-B", [10]);

  // 模拟 device-A marker TTL 过期：删 marker 但保留 set 成员
  stub.strings.delete("presence:subs:device:7:device-A");

  const ids = await manager.listSubscribers(10);
  assert.deepEqual(ids, [8]);
  // 过期成员被惰性回收
  assert.deepEqual(Array.from(stub.sets.get("presence:subs:10") ?? []), [
    "8:device-B"
  ]);
});

test("cleanupClient removes all subs for the given device", async () => {
  const manager = new PresenceSubscriptionManager(300);
  await manager.subscribe(7, "device-A", [10, 20]);
  await manager.subscribe(7, "device-B", [10]);

  await manager.cleanupClient(7, "device-A");
  // device-A 在 10、20 都被清理
  assert.deepEqual(Array.from(stub.sets.get("presence:subs:10") ?? []), [
    "7:device-B"
  ]);
  assert.equal(stub.sets.get("presence:subs:20"), undefined);
  assert.equal(stub.sets.get("presence:subs-by:7:device-A"), undefined);
  assert.equal(stub.strings.get("presence:subs:device:7:device-A"), undefined);
});

test("refreshDeviceTtl is a no-op when no marker exists", async () => {
  const manager = new PresenceSubscriptionManager(300);
  await manager.refreshDeviceTtl(7, "device-A");
  // 没有断言副作用，调用不应抛
  assert.equal(stub.sets.size, 0);
  assert.equal(stub.strings.size, 0);
});
