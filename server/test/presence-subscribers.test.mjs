import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const presenceManagerModule = require("../dist/server/src/websocket/presence_manager.js");
const contactRepositoryModule = require("../dist/server/src/repository/contact_repository.js");

const { WebSocketPresenceManager } = presenceManagerModule;
const ContactRepository = contactRepositoryModule.default;

/**
 * P1 验证：listPresenceSubscriberIds 应当返回"我保存的联系人" ∪ "把我加为联系人的人" 的去重并集。
 *
 * 修复前：仅取 forward（listContacts），单向加联系人的反向用户漏推。
 * 修复后：union 二者。
 */
test("listPresenceSubscriberIds unions forward and reverse contacts", async () => {
  const originalListContacts = ContactRepository.listContacts;
  const originalListReverseContactOwners =
    ContactRepository.listReverseContactOwners;

  // 场景：B 用户 (id=10) 自己保存了 [21, 22]；同时 [22, 33, 34] 把 B 加为联系人。
  // 期望并集（去重）= [21, 22, 33, 34]
  ContactRepository.listContacts = async userId => {
    assert.equal(userId, 10);
    return [{ user_id: 21 }, { user_id: 22 }];
  };
  ContactRepository.listReverseContactOwners = async contactUserId => {
    assert.equal(contactUserId, 10);
    return [22, 33, 34];
  };

  try {
    const manager = new WebSocketPresenceManager(
      new Map(), // ClientRegistry stub
      "test-node",
      70,
      async () => undefined
    );

    // 私有方法在编译产物里仍然可调用
    const result = await manager.listPresenceSubscriberIds(10);
    const sorted = [...result].sort((a, b) => a - b);
    assert.deepEqual(sorted, [21, 22, 33, 34]);
  } finally {
    ContactRepository.listContacts = originalListContacts;
    ContactRepository.listReverseContactOwners =
      originalListReverseContactOwners;
  }
});

test("listPresenceSubscriberIds filters non-positive / NaN ids", async () => {
  const originalListContacts = ContactRepository.listContacts;
  const originalListReverseContactOwners =
    ContactRepository.listReverseContactOwners;

  ContactRepository.listContacts = async () => [
    { user_id: 0 },
    { user_id: -1 },
    { user_id: NaN },
    { user_id: 5 }
  ];
  ContactRepository.listReverseContactOwners = async () => [
    null,
    undefined,
    "abc",
    7,
    5
  ];

  try {
    const manager = new WebSocketPresenceManager(
      new Map(),
      "test-node",
      70,
      async () => undefined
    );

    const result = await manager.listPresenceSubscriberIds(10);
    const sorted = [...result].sort((a, b) => a - b);
    assert.deepEqual(sorted, [5, 7]);
  } finally {
    ContactRepository.listContacts = originalListContacts;
    ContactRepository.listReverseContactOwners =
      originalListReverseContactOwners;
  }
});
