import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { setTimeout as delay } from "node:timers/promises";

// 必须在 require 模块前设置，否则 config 模块加载时拿到默认值
process.env.PRESENCE_TRANSITION_DEBOUNCE_MS = "80";

const require = createRequire(import.meta.url);
const presenceManagerModule = require("../dist/server/src/websocket/presence_manager.js");
const contactRepositoryModule = require("../dist/server/src/repository/contact_repository.js");
const userDeviceRepositoryModule = require("../dist/server/src/repository/user_device_repository.js");
const privacyRepoModule = require("../dist/server/src/repository/privacy_repository.js");

const { WebSocketPresenceManager } = presenceManagerModule;
const ContactRepository = contactRepositoryModule.default;
const UserDeviceRepository = userDeviceRepositoryModule.default;
const PrivacyRepository = privacyRepoModule.default;

/**
 * P3.4 验证：短时间内多次 broadcastPresenceTransition 仅产生一次 flush。
 * 实际表现：通过 dispatchToUser 调用次数来观察。
 */
test("broadcastPresenceTransition debounces rapid transitions", async () => {
  const originals = {
    listContacts: ContactRepository.listContacts,
    listReverseContactOwners: ContactRepository.listReverseContactOwners,
    listSavedContactIds: ContactRepository.listSavedContactIds,
    listLatestActivityByUsers: UserDeviceRepository.listLatestActivityByUsers,
    findByUserId: PrivacyRepository.findByUserId
  };

  // 被广播者 user=10；订阅者只有 user=20，且 visibility=anyone（不会被隐藏）
  ContactRepository.listContacts = async () => [{ user_id: 20 }];
  ContactRepository.listReverseContactOwners = async () => [];
  ContactRepository.listSavedContactIds = async () => [];
  UserDeviceRepository.listLatestActivityByUsers = async () => [];
  // broadcast 路径改走 findByUserId
  PrivacyRepository.findByUserId = async () => ({
    user_id: 10,
    presence_visibility: 0
  });

  const dispatchCalls = [];
  const dispatchToUser = async (userId, payload) => {
    dispatchCalls.push({ userId, payload });
  };

  try {
    const manager = new WebSocketPresenceManager(
      new Map(),
      "test-node",
      70,
      dispatchToUser
    );
    // 强制设置 debounce 时长，规避 config 模块预加载导致 env 未生效
    manager.debounceMs = 80;

    // 模拟 getPresenceSummary 始终返回 online=true（user 已在线）
    manager.getPresenceSummary = async () => ({
      is_online: true,
      active_device_count: 1,
      last_active_at: undefined
    });

    // 触发 5 次抖动（previousOnline=false）
    await manager.broadcastPresenceTransition(10, false);
    await manager.broadcastPresenceTransition(10, false);
    await manager.broadcastPresenceTransition(10, false);
    await manager.broadcastPresenceTransition(10, false);
    await manager.broadcastPresenceTransition(10, false);

    // debounce 时间内不应有任何 dispatch
    assert.equal(dispatchCalls.length, 0);

    // 等 debounce 触发
    await delay(400);

    // 仅应触发一次 dispatch
    assert.equal(dispatchCalls.length, 1);
    assert.equal(dispatchCalls[0].userId, 20);
    assert.equal(dispatchCalls[0].payload.user_id, 10);
    assert.equal(dispatchCalls[0].payload.is_online, true);
  } finally {
    ContactRepository.listContacts = originals.listContacts;
    ContactRepository.listReverseContactOwners =
      originals.listReverseContactOwners;
    ContactRepository.listSavedContactIds = originals.listSavedContactIds;
    UserDeviceRepository.listLatestActivityByUsers =
      originals.listLatestActivityByUsers;
    PrivacyRepository.findByUserId = originals.findByUserId;
  }
});
