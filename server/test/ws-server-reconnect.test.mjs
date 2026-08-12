import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { setTimeout as delay } from "node:timers/promises";

const require = createRequire(import.meta.url);
const presenceManagerModule = require("../dist/server/src/websocket/presence_manager.js");
const redisModule = require("../dist/server/src/cache/redis.js");
const contactRepositoryModule = require("../dist/server/src/repository/contact_repository.js");
const userDeviceRepositoryModule = require("../dist/server/src/repository/user_device_repository.js");
const privacyRepoModule = require("../dist/server/src/repository/privacy_repository.js");
const subscriptionModule = require("../dist/server/src/websocket/presence_subscription_manager.js");

const { WebSocketPresenceManager } = presenceManagerModule;
// subscriptionModule is required indirectly so its module-level side effects
// match the production load order (and to make sure cleanupClient stays safe).
void subscriptionModule;
const redis = redisModule.getRedis();
const ContactRepository = contactRepositoryModule.default;
const UserDeviceRepository = userDeviceRepositoryModule.default;
const PrivacyRepository = privacyRepoModule.default;

/**
 * 内存版 Redis stub。仅实现 unregister/register 路径用到的命令。
 */
function installRedisStub() {
  const hashes = new Map(); // key -> Map<field, number|string>
  const strings = new Map();

  const original = {};
  for (const m of [
    "hincrby",
    "hdel",
    "hset",
    "hkeys",
    "expire",
    "set",
    "del",
    "exists",
    "multi",
    "pipeline",
    "sadd",
    "srem",
    "smembers"
  ]) {
    original[m] = redis[m];
  }

  redis.hincrby = async (key, field, by) => {
    const h = hashes.get(key) ?? new Map();
    const cur = Number(h.get(field) ?? 0);
    const next = cur + Number(by);
    h.set(field, next);
    hashes.set(key, h);
    return next;
  };
  redis.hdel = async (key, ...fields) => {
    const h = hashes.get(key);
    if (!h) return 0;
    let n = 0;
    for (const f of fields) {
      if (h.delete(f)) n++;
    }
    if (h.size === 0) hashes.delete(key);
    return n;
  };
  redis.hset = async (key, field, value) => {
    const h = hashes.get(key) ?? new Map();
    const isNew = !h.has(field);
    h.set(field, value);
    hashes.set(key, h);
    return isNew ? 1 : 0;
  };
  redis.hkeys = async key => Array.from(hashes.get(key)?.keys() ?? []);
  redis.expire = async () => 1;
  redis.set = async (key, value) => {
    strings.set(key, String(value));
    return "OK";
  };
  redis.del = async (...keys) => {
    let n = 0;
    for (const k of keys) {
      if (hashes.delete(k)) n++;
      if (strings.delete(k)) n++;
    }
    return n;
  };
  redis.exists = async key => (hashes.has(key) || strings.has(key) ? 1 : 0);
  // PresenceSubscriptionManager.cleanupClient 会用到这些；简单 stub 即可。
  redis.sadd = async () => 0;
  redis.srem = async () => 0;
  redis.smembers = async () => [];

  function buildChain() {
    const ops = [];
    const chain = new Proxy(
      {
        exec: async () => {
          const out = [];
          for (const fn of ops) out.push([null, await fn()]);
          return out;
        }
      },
      {
        get(target, prop) {
          if (prop in target) return target[prop];
          return (...args) => {
            ops.push(() => redis[prop]?.(...args));
            return chain;
          };
        }
      }
    );
    return chain;
  }
  redis.multi = () => buildChain();
  redis.pipeline = () => buildChain();

  return {
    hashes,
    strings,
    restore() {
      for (const [k, v] of Object.entries(original)) {
        redis[k] = v;
      }
    },
    reset() {
      hashes.clear();
      strings.clear();
    }
  };
}

const stub = installRedisStub();

// 新 schema (commit 6e34b542 起，2026-05-15)：
//   ws:user:{uid}:devices                   hash<deviceId, nodeId>     长存 24h
//   ws:user:{uid}:device:{did}:presence     string=nodeId              短 TTL 70s
// 旧 schema 的 ws:user:{uid}:nodes 引用计数器已废弃。
function deviceNodeOf(userId, deviceId) {
  return stub.hashes.get(`ws:user:${userId}:devices`)?.get(deviceId);
}
function devicePresenceOf(userId, deviceId) {
  return stub.strings.get(`ws:user:${userId}:device:${deviceId}:presence`);
}

const repoOriginals = {
  listContacts: ContactRepository.listContacts,
  listReverseContactOwners: ContactRepository.listReverseContactOwners,
  listSavedContactIds: ContactRepository.listSavedContactIds,
  listLatestActivityByUsers: UserDeviceRepository.listLatestActivityByUsers,
  findByUserId: PrivacyRepository.findByUserId
};

ContactRepository.listContacts = async () => [];
ContactRepository.listReverseContactOwners = async () => [];
ContactRepository.listSavedContactIds = async () => [];
UserDeviceRepository.listLatestActivityByUsers = async () => [];
PrivacyRepository.findByUserId = async () => ({
  user_id: 0,
  presence_visibility: 0
});

test.beforeEach(() => {
  stub.reset();
});

test.after(() => {
  for (const [k, v] of Object.entries(repoOriginals)) {
    if (k === "listLatestActivityByUsers") {
      UserDeviceRepository[k] = v;
    } else if (k === "findByUserId") {
      PrivacyRepository[k] = v;
    } else {
      ContactRepository[k] = v;
    }
  }
  stub.restore();
  try {
    redis.disconnect();
  } catch {
    // ignore
  }
});

/**
 * 构造一个 fake Client。socket 只需要满足 readyState 与 terminate/close。
 */
function makeFakeClient(userId, deviceId) {
  let terminated = false;
  let closed = false;
  return {
    id: String(userId),
    userId,
    deviceId,
    isAlive: true,
    lastPingTime: Date.now(),
    socket: {
      readyState: 1, // OPEN
      terminate() {
        terminated = true;
        this.readyState = 3; // CLOSED
      },
      close() {
        closed = true;
        this.readyState = 3;
      },
      get _terminated() {
        return terminated;
      },
      get _closed() {
        return closed;
      }
    }
  };
}

test("unregisterClient: default mode is idempotent under concurrent calls", async () => {
  const clients = new Map();
  const dispatchCalls = [];
  const manager = new WebSocketPresenceManager(
    clients,
    "node-1",
    70,
    async (userId, payload) => {
      dispatchCalls.push({ userId, payload });
    }
  );
  // 关闭 debounce，简化断言
  manager.debounceMs = 0;

  const c = makeFakeClient(100, "dev-A");
  const userClients = new Map();
  userClients.set("dev-A", c);
  clients.set("100", userClients);

  // 先注册到 Redis（模拟连接建立时的 registerPresence）
  await manager.registerPresence(c);

  // 验证初始 Redis 痕迹：devices 注册表 + 短 TTL presence key
  assert.equal(deviceNodeOf(100, "dev-A"), "node-1");
  assert.ok(devicePresenceOf(100, "dev-A"));

  // 并发触发两次 unregister（模拟 close 事件 + 主动 disconnect 撞车）
  await Promise.all([
    manager.unregisterClient(100, "dev-A"),
    manager.unregisterClient(100, "dev-A")
  ]);

  // hdel/del 幂等：device 注册表条目与 presence key 都被清空
  assert.equal(
    deviceNodeOf(100, "dev-A"),
    undefined,
    "devices entry should be removed"
  );
  assert.equal(
    devicePresenceOf(100, "dev-A"),
    undefined,
    "device presence key should be deleted"
  );

  // map 已清理
  assert.equal(clients.has("100"), false);
});

test("unregisterClient: explicit-client mode does NOT remove a different client living at same deviceId", async () => {
  const clients = new Map();
  const manager = new WebSocketPresenceManager(
    clients,
    "node-1",
    70,
    async () => {}
  );
  manager.debounceMs = 0;

  const oldClient = makeFakeClient(200, "dev-X");
  const newClient = makeFakeClient(200, "dev-X");

  // 先放旧的，注册 Redis
  const userClients = new Map();
  userClients.set("dev-X", oldClient);
  clients.set("200", userClients);
  await manager.registerPresence(oldClient);

  // 模拟"重连流程"：调用方先把 map 替换为新 client
  userClients.set("dev-X", newClient);
  await manager.registerPresence(newClient);

  // 新 schema 下，hset 覆盖语义：两次 register 后 devices.dev-X 仍指向 "node-1"
  // （旧 schema 用 hincrby 计数器，此处会是 2；新 schema 没有计数概念）
  assert.equal(deviceNodeOf(200, "dev-X"), "node-1");

  // 显式模式 unregister 旧 client：在新 schema 下 hdel/del 会把整个 dev-X 痕迹一起清掉
  // （key 不区分 client 实例）。生产路径 ws_server.ts 的调用顺序是
  //   unregister(prev) → register(next)
  // 因此不会出现"旧痕迹未清完就 register 了新 client"的撞车，本测试只保证
  // explicit-client 模式不会误动 map 中"非传入实例"的那把客户端引用。
  await manager.unregisterClient(200, "dev-X", { client: oldClient });

  // map 中仍是新 client（核心契约：explicit 模式不动 map 中的"非传入"实例）
  assert.equal(clients.get("200").get("dev-X"), newClient);
});

test("unregisterClient: explicit-client mode also cleans Redis when map already deleted", async () => {
  const clients = new Map();
  const manager = new WebSocketPresenceManager(
    clients,
    "node-1",
    70,
    async () => {}
  );
  manager.debounceMs = 0;

  const c = makeFakeClient(300, "dev-Y");
  const userClients = new Map();
  userClients.set("dev-Y", c);
  clients.set("300", userClients);
  await manager.registerPresence(c);

  // 模拟调用方已经 delete 过 map（heartbeat 路径就是这样）
  userClients.delete("dev-Y");

  // 显式 client 模式：仍然要把 Redis 清理掉
  await manager.unregisterClient(300, "dev-Y", { client: c });

  assert.equal(deviceNodeOf(300, "dev-Y"), undefined);
  assert.equal(devicePresenceOf(300, "dev-Y"), undefined);
});

test("reconnect simulation: same deviceId reconnect cleans previous Redis trace and terminates old socket", async () => {
  // 这是 C1 修复的核心用例：模拟 ws_server.ts 中 initAuthenticatedConnection
  // 内 set(deviceId, client) 之前的清理逻辑。
  const clients = new Map();
  const manager = new WebSocketPresenceManager(
    clients,
    "node-1",
    70,
    async () => {}
  );
  manager.debounceMs = 0;

  // 旧连接（半开 TCP，close 事件未到达）
  const previous = makeFakeClient(400, "dev-Z");
  const userClients = new Map();
  userClients.set("dev-Z", previous);
  clients.set("400", userClients);
  await manager.registerPresence(previous);

  // 新连接（同 deviceId）
  const next = makeFakeClient(400, "dev-Z");

  // ===== 模拟 ws_server.ts 中新增的清理流程 =====
  const prev = userClients.get("dev-Z");
  if (prev && prev !== next) {
    userClients.delete("dev-Z");
    await manager.unregisterClient(400, "dev-Z", { client: prev });
    prev.socket.terminate();
    // unregister 可能因 size===0 把外层 map 槽位也删了，重新确保
    if (!clients.get("400")) {
      clients.set("400", userClients);
    }
  }
  userClients.set("dev-Z", next);
  await manager.registerPresence(next);

  // 旧 socket 被 terminate
  assert.equal(previous.socket._terminated, true);
  // map 中是新 client
  assert.equal(clients.get("400").get("dev-Z"), next);
  // device 注册表指向本节点（新连接的 hset 覆盖）
  assert.equal(deviceNodeOf(400, "dev-Z"), "node-1");
  // 短 TTL presence key 已写入
  assert.ok(devicePresenceOf(400, "dev-Z"));

  // 模拟旧 socket 的 close 事件最终到达：在 ws_server.ts 中由 stale check 跳过 unregister，
  // 真实路径下不会触发下面这次 explicit unregister。
  // 这里探一下边界：新 schema 下 key 不区分 client 实例，二次显式 unregister(prev)
  // 仍会执行 hdel/del，把新 client 的 Redis 痕迹一并清掉。
  // 这反过来强调：调用方不应对同一 device 重复调用 explicit unregister。
  await manager.unregisterClient(400, "dev-Z", { client: previous });
  assert.equal(deviceNodeOf(400, "dev-Z"), undefined);
  assert.equal(devicePresenceOf(400, "dev-Z"), undefined);
});

test("reconnect: without explicit cleanup, old socket is NOT terminated (caller responsibility)", async () => {
  // 反向用例：演示如果调用方在 register(next) 之前未调用 unregisterClient(prev) +
  // prev.socket.terminate()，旧 socket 会被遗留为半开状态。
  //
  // 新 schema 下 hset 覆盖语义已经从结构上免疫了旧的"refcount 累加"bug，
  // 因此不再断言"计数被累加到 2"——但旧 socket 不被 terminate 这条契约仍然有效，
  // 提醒调用方必须显式释放旧 socket。
  const clients = new Map();
  const manager = new WebSocketPresenceManager(
    clients,
    "node-1",
    70,
    async () => {}
  );
  manager.debounceMs = 0;

  const previous = makeFakeClient(500, "dev-W");
  const userClients = new Map();
  userClients.set("dev-W", previous);
  clients.set("500", userClients);
  await manager.registerPresence(previous);

  // 直接覆盖（没有清理 — 这是错误用法演示）
  const next = makeFakeClient(500, "dev-W");
  userClients.set("dev-W", next);
  await manager.registerPresence(next);

  // 旧 socket 没被 terminate：调用方未尽到释放责任
  assert.equal(previous.socket._terminated, false);
});

test("registerPresence: single call writes devices entry and short-TTL presence key", async () => {
  // 防御性测试：确认 registerPresence 调用一次后，新 schema 下的两类 Redis 痕迹都被写入。
  const clients = new Map();
  const manager = new WebSocketPresenceManager(
    clients,
    "node-1",
    70,
    async () => {}
  );
  manager.debounceMs = 0;

  const c = makeFakeClient(600, "dev-Q");
  await manager.registerPresence(c);
  assert.equal(deviceNodeOf(600, "dev-Q"), "node-1");
  assert.ok(devicePresenceOf(600, "dev-Q"));
});

// 让事件循环跑完任何挂起的 broadcastPresenceTransition microtask
test.after(async () => {
  await delay(50);
});
