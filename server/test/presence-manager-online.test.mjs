import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const presenceManagerModule = require("../dist/server/src/websocket/presence_manager.js");
const userDeviceRepositoryModule = require("../dist/server/src/repository/user_device_repository.js");
const redisModule = require("../dist/server/src/cache/redis.js");

const { WebSocketPresenceManager } = presenceManagerModule;
const UserDeviceRepository = userDeviceRepositoryModule.default;
const redis = redisModule.getRedis();

/**
 * 单一可信源验证：getPresenceSummary 不再读取 in-process clients map，
 * 只依赖 Redis 中的 device presence key（短 TTL）。
 *
 * 这是修复 "ghost online" 与 "header 闪烁 在线/X 小时前活跃" 的根因。
 */

function buildInMemoryRedisStub() {
  // 仅 stub 我们用到的 hash / string 命令；其余抛错以便定位漏覆盖。
  const hashes = new Map(); // key -> Map<field, value>
  const strings = new Map(); // key -> { value, expireAt }
  const now = () => Date.now();

  function hgetAll(key) {
    const h = hashes.get(key);
    if (!h) return {};
    return Object.fromEntries(h);
  }
  function hkeys(key) {
    const h = hashes.get(key);
    return h ? Array.from(h.keys()) : [];
  }
  function exists(key) {
    const s = strings.get(key);
    if (!s) return 0;
    if (s.expireAt && s.expireAt < now()) {
      strings.delete(key);
      return 0;
    }
    return 1;
  }

  return {
    impl: {
      hkeys,
      hgetall: hgetAll,
      exists,
      hset(key, field, value) {
        if (!hashes.has(key)) hashes.set(key, new Map());
        hashes.get(key).set(field, value);
      },
      hdel(key, ...fields) {
        const h = hashes.get(key);
        if (!h) return 0;
        let n = 0;
        for (const f of fields) {
          if (h.delete(f)) n++;
        }
        if (h.size === 0) hashes.delete(key);
        return n;
      },
      del(key) {
        return strings.delete(key) ? 1 : 0;
      },
      set(key, value, _mode, ttl) {
        strings.set(key, { value, expireAt: ttl ? now() + ttl * 1000 : 0 });
        return "OK";
      },
      expireKey(key, ttlSec) {
        const s = strings.get(key);
        if (s) s.expireAt = now() + ttlSec * 1000;
      }
    },
    hashes,
    strings
  };
}

function patchRedis(stub) {
  const saved = {};
  const wrap = name => {
    saved[name] = redis[name];
    redis[name] = async (...args) => stub.impl[name](...args);
  };
  // ioredis-style methods
  wrap("hkeys");
  wrap("hgetall");
  wrap("exists");
  wrap("hset");
  wrap("hdel");
  wrap("del");
  wrap("set");
  saved.expire = redis.expire;
  redis.expire = async () => 1;
  saved.hincrby = redis.hincrby;
  // hincrby fallback (not exercised here, but presence_manager uses it elsewhere)
  redis.hincrby = async () => 1;
  saved.scan = redis.scan;
  // Scan over the stub's hashes map for keys matching given MATCH pattern.
  redis.scan = async (cursor, _matchKw, pattern, _countKw, _count) => {
    const re = new RegExp(
      "^" +
        pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") +
        "$"
    );
    const keys = Array.from(stub.hashes.keys()).filter(k => re.test(k));
    return ["0", keys];
  };
  return () => Object.assign(redis, saved);
}

test("getPresenceSummary returns is_online=false when no device presence keys exist (no ghost from clients map)", async () => {
  const stub = buildInMemoryRedisStub();
  const restoreRedis = patchRedis(stub);
  const originalLatest = UserDeviceRepository.listLatestActivityByUsers;
  UserDeviceRepository.listLatestActivityByUsers = async () => [];

  try {
    // devices 注册表中残留一项（ghost），但短 TTL presence 已不存在 → 应判定离线
    stub.impl.hset("ws:user:42:devices", "device-A", "node-1");
    // 注意：未为 device-A 设置 ws:user:42:device:device-A:presence

    const manager = new WebSocketPresenceManager(
      new Map(), // 即使 clients map 是空的也无所谓——新实现根本不再读它
      "node-1",
      70,
      async () => undefined
    );

    const summary = await manager.getPresenceSummary(42);
    assert.equal(summary.is_online, false);
    assert.equal(summary.active_device_count, 0);
    assert.ok(typeof summary.observed_at === "string", "observed_at populated");

    // 惰性 GC：stale device 应被从 devices 注册表中清掉
    // (由于 hdel 在 promise 链中异步触发，给一个 microtask 让其完成)
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(stub.impl.hkeys("ws:user:42:devices").length, 0);
  } finally {
    restoreRedis();
    UserDeviceRepository.listLatestActivityByUsers = originalLatest;
  }
});

test("getPresenceSummary returns is_online=true when at least one device presence key exists", async () => {
  const stub = buildInMemoryRedisStub();
  const restoreRedis = patchRedis(stub);
  const originalLatest = UserDeviceRepository.listLatestActivityByUsers;
  UserDeviceRepository.listLatestActivityByUsers = async () => [];

  try {
    stub.impl.hset("ws:user:42:devices", "device-A", "node-1");
    stub.impl.set("ws:user:42:device:device-A:presence", "node-1", "EX", 70);

    const manager = new WebSocketPresenceManager(
      new Map(),
      "node-1",
      70,
      async () => undefined
    );

    const summary = await manager.getPresenceSummary(42);
    assert.equal(summary.is_online, true);
    assert.equal(summary.active_device_count, 1);
  } finally {
    restoreRedis();
    UserDeviceRepository.listLatestActivityByUsers = originalLatest;
  }
});

test("reconcileNodeCounter cleans only this node's stale device entries (multi-node safe)", async () => {
  const stub = buildInMemoryRedisStub();
  const restoreRedis = patchRedis(stub);
  const originalLatest = UserDeviceRepository.listLatestActivityByUsers;
  UserDeviceRepository.listLatestActivityByUsers = async () => [];

  try {
    // user 100：node-1 留下了一个 ghost device，node-2 有一个仍然活跃的 device
    stub.impl.hset("ws:user:100:devices", "dev-ghost-on-node1", "node-1");
    stub.impl.hset("ws:user:100:devices", "dev-alive-on-node2", "node-2");
    stub.impl.set(
      "ws:user:100:device:dev-alive-on-node2:presence",
      "node-2",
      "EX",
      70
    );

    // user 200：仅 node-1 上有 ghost
    stub.impl.hset("ws:user:200:devices", "dev-ghost", "node-1");

    const manager = new WebSocketPresenceManager(
      new Map(),
      "node-1",
      70,
      async () => undefined
    );

    await manager.reconcileNodeCounter();

    // user 100：node-1 的 ghost device 被清掉，node-2 完全保留
    assert.deepEqual(stub.impl.hkeys("ws:user:100:devices"), [
      "dev-alive-on-node2"
    ]);
    // node-2 仍然在线
    const summary100 = await manager.getPresenceSummary(100);
    assert.equal(summary100.is_online, true);

    // user 200：node-1 上的 ghost device 被移除，devices 表也清空
    assert.deepEqual(stub.impl.hkeys("ws:user:200:devices"), []);
    const summary200 = await manager.getPresenceSummary(200);
    assert.equal(summary200.is_online, false);
  } finally {
    restoreRedis();
    UserDeviceRepository.listLatestActivityByUsers = originalLatest;
  }
});

test("reconcileNodeCounter skips devices with live presence key (race-safe with new connections)", async () => {
  const stub = buildInMemoryRedisStub();
  const restoreRedis = patchRedis(stub);
  const originalLatest = UserDeviceRepository.listLatestActivityByUsers;
  UserDeviceRepository.listLatestActivityByUsers = async () => [];

  try {
    // user 300：node-1 上有两个 device，一个新近注册（presence key 仍存在），一个 ghost
    stub.impl.hset("ws:user:300:devices", "dev-fresh", "node-1");
    stub.impl.hset("ws:user:300:devices", "dev-ghost", "node-1");
    // 仅 dev-fresh 有 short-TTL presence key
    stub.impl.set("ws:user:300:device:dev-fresh:presence", "node-1", "EX", 70);

    const manager = new WebSocketPresenceManager(
      new Map(),
      "node-1",
      70,
      async () => undefined
    );

    await manager.reconcileNodeCounter();

    // dev-fresh 必须被保留（它是活跃新连接，不是 ghost）
    assert.deepEqual(stub.impl.hkeys("ws:user:300:devices"), ["dev-fresh"]);
    // 用户应仍然在线
    const summary = await manager.getPresenceSummary(300);
    assert.equal(summary.is_online, true);
    assert.equal(summary.active_device_count, 1);
  } finally {
    restoreRedis();
    UserDeviceRepository.listLatestActivityByUsers = originalLatest;
  }
});
