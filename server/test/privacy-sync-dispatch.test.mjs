import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const privacyServiceModule = require("../dist/server/src/service/privacy_service.js");
const privacyRepositoryModule = require("../dist/server/src/repository/privacy_repository.js");
const redisModule = require("../dist/server/src/cache/redis.js");
const wsModule = require("../dist/server/src/websocket/index.js");

const PrivacyService = privacyServiceModule.default;
const PrivacyRepository = privacyRepositoryModule.default;
const redis = redisModule.getRedis();
const { wsServer } = wsModule;

const originals = {
  update: PrivacyRepository.update,
  findByUserId: PrivacyRepository.findByUserId,
  dispatchToUser: wsServer.dispatchToUser
};

test.afterEach(() => {
  PrivacyRepository.update = originals.update;
  PrivacyRepository.findByUserId = originals.findByUserId;
  wsServer.dispatchToUser = originals.dispatchToUser;
});

test.after(() => {
  try {
    redis.disconnect();
  } catch (e) {
    void e;
  }
  try {
    wsServer.wss?.close?.();
  } catch (e) {
    void e;
  }
});

test("updatePrivacySettings dispatches privacy_sync envelope with version", async () => {
  const userId = 7001;
  const updatedAt = new Date("2026-01-01T00:00:00.000Z");

  PrivacyRepository.update = async () => ({
    user_id: userId,
    discoverable_by_username: 0,
    discoverable_by_phone: 0,
    message_permission: 0,
    presence_visibility: 0,
    read_receipts_visibility: 2,
    version: 5,
    updated_at: updatedAt
  });

  const dispatches = [];
  wsServer.dispatchToUser = async (uid, msg) => {
    dispatches.push({ uid, msg });
  };

  const env = await PrivacyService.updatePrivacySettings(userId, {
    read_receipts_visibility: 2
  });

  // Allow microtask: dispatch is .catch chained, but invocation itself is sync
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(env.version, 5);
  assert.equal(env.settings.read_receipts_visibility, 2);
  assert.equal(env.updated_at, updatedAt.toISOString());

  assert.equal(dispatches.length, 1);
  assert.equal(dispatches[0].uid, userId);
  assert.equal(dispatches[0].msg.messageClassify, "privacy_sync");
  assert.equal(dispatches[0].msg.version, 5);
  assert.equal(dispatches[0].msg.settings.read_receipts_visibility, 2);
});

test("getPrivacySettings returns envelope with version", async () => {
  PrivacyRepository.findByUserId = async () => ({
    user_id: 8001,
    discoverable_by_username: 0,
    discoverable_by_phone: 0,
    message_permission: 0,
    presence_visibility: 0,
    read_receipts_visibility: 0,
    version: 3,
    updated_at: new Date("2026-02-02T00:00:00.000Z")
  });

  const env = await PrivacyService.getPrivacySettings(8001);
  assert.equal(env.version, 3);
  assert.equal(env.settings.read_receipts_visibility, 0);
  assert.equal(env.updated_at, "2026-02-02T00:00:00.000Z");
});

test("updatePrivacySettings rejects invalid value", async () => {
  await assert.rejects(
    PrivacyService.updatePrivacySettings(1, { read_receipts_visibility: 5 }),
    /Privacy setting must be/
  );
});
