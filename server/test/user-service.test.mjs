import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const conversationRepositoryModule = require("../dist/server/src/repository/conversation/conversation_core_repository.js");
const conversationMemberRepositoryModule = require("../dist/server/src/repository/conversation/conversation_member_repository.js");
const outboxRepositoryModule = require("../dist/server/src/repository/outbox_repository.js");
const pgModule = require("../dist/server/src/db/pg.js");
const authAuditRepositoryModule = require("../dist/server/src/repository/auth_audit_repository.js");
const userDeviceRepositoryModule = require("../dist/server/src/repository/user_device_repository.js");
const userSessionRepositoryModule = require("../dist/server/src/repository/user_session_repository.js");
const privacyRepositoryModule = require("../dist/server/src/repository/privacy_repository.js");
const userServiceModule = require("../dist/server/src/service/user_service.js");
const userDeviceServiceModule = require("../dist/server/src/service/user_device_service.js");
const presenceServiceModule = require("../dist/server/src/service/presence_service.js");
const userRepositoryModule = require("../dist/server/src/repository/user_repository.js");
const contactRepositoryModule = require("../dist/server/src/repository/contact_repository.js");
const contactServiceModule = require("../dist/server/src/service/contact_service.js");
const wsModule = require("../dist/server/src/websocket/index.js");
const redisModule = require("../dist/server/src/cache/redis.js");

const AuthAuditRepository = authAuditRepositoryModule.default;
const ConversationRepository = conversationRepositoryModule.default;
const ConversationMemberRepository = conversationMemberRepositoryModule.default;
const OutboxRepository = outboxRepositoryModule.default;
const pg = pgModule.default;
const UserDeviceRepository = userDeviceRepositoryModule.default;
const UserSessionRepository = userSessionRepositoryModule.default;
const PrivacyRepository = privacyRepositoryModule.default;
const UserService = userServiceModule.default;
const UserDeviceService = userDeviceServiceModule.default;
const PresenceService = presenceServiceModule.default;
const UserRepository = userRepositoryModule.default;
const ContactRepository = contactRepositoryModule.default;
const ContactService = contactServiceModule.default;
const { wsServer } = wsModule;
const redis = redisModule.getRedis();

async function cleanupRealtimeResources() {
  try {
    if (wsServer.heartbeatTimer) {
      clearInterval(wsServer.heartbeatTimer);
    }
  } catch (error) {
    void error;
  }
  try {
    if (wsServer.subscriber?.disconnect) {
      wsServer.subscriber.disconnect();
    }
  } catch (error) {
    void error;
  }
  try {
    if (wsServer.wss?.clients) {
      for (const client of wsServer.wss.clients) {
        client.close();
      }
    }
  } catch (error) {
    void error;
  }
  try {
    if (wsServer.wss?.close) {
      wsServer.wss.close();
    }
  } catch (error) {
    void error;
  }
  try {
    redis.disconnect();
  } catch (error) {
    void error;
  }
}

const originalAuthAuditInsert = AuthAuditRepository.insert;
const originalAuthAuditListByUser = AuthAuditRepository.listByUser;
const originalFindActiveConversationIdsByUser =
  ConversationRepository.findActiveConversationIdsByUser;
const originalRefreshMemberProfileCache =
  ConversationMemberRepository.refreshMemberProfileCache;
const originalTouchConversations = ConversationRepository.touchConversations;
const originalFindConversationSyncTargets =
  ConversationRepository.findConversationSyncTargets;
const originalInsertEvents = OutboxRepository.insertEvents;
const originalPgTx = pg.tx;
const originalPrivacyEnsureForUser = PrivacyRepository.ensureForUser;
const originalCreate = UserRepository.create;
const originalFindById = UserRepository.findById;
const originalFindByUsername = UserRepository.findByUsername;
const originalSearch = UserRepository.search;
const originalUpdateProfile = UserRepository.updateProfile;
const originalUpdatePassword = UserRepository.updatePassword;
const originalUpdateLastLoginAt = UserRepository.updateLastLoginAt;
const originalUserDeviceListByUser = UserDeviceRepository.listByUser;
const originalUserDeviceListLatestActivityByUsers =
  UserDeviceRepository.listLatestActivityByUsers;
const originalUserDeviceUpdateDeviceStatus =
  UserDeviceRepository.updateDeviceStatus;
const originalUserDeviceUpdateDevicesStatusByUser =
  UserDeviceRepository.updateDevicesStatusByUser;
const originalUserSessionCountActiveSessionsByUser =
  UserSessionRepository.countActiveSessionsByUser;
const originalUserSessionRevokeSession = UserSessionRepository.revokeSession;
const originalUserSessionRevokeSessionsByUser =
  UserSessionRepository.revokeSessionsByUser;
const originalDispatchToUser = wsServer.dispatchToUser;
const originalGetPresenceSummary = wsServer.getPresenceSummary;
const originalGetOnlineDeviceIds = wsServer.getOnlineDeviceIds;
const originalDisconnectUserDevices = wsServer.disconnectUserDevices;
const originalLookupUserByPhone = ContactService.lookupUserByPhone;
const originalCanDiscoverUser = ContactService.canDiscoverUser;

test.afterEach(() => {
  AuthAuditRepository.insert = originalAuthAuditInsert;
  AuthAuditRepository.listByUser = originalAuthAuditListByUser;
  ConversationRepository.findActiveConversationIdsByUser =
    originalFindActiveConversationIdsByUser;
  ConversationMemberRepository.refreshMemberProfileCache =
    originalRefreshMemberProfileCache;
  ConversationRepository.touchConversations = originalTouchConversations;
  ConversationRepository.findConversationSyncTargets =
    originalFindConversationSyncTargets;
  OutboxRepository.insertEvents = originalInsertEvents;
  pg.tx = originalPgTx;
  PrivacyRepository.ensureForUser = originalPrivacyEnsureForUser;
  UserRepository.create = originalCreate;
  UserRepository.findById = originalFindById;
  UserRepository.findByUsername = originalFindByUsername;
  UserRepository.search = originalSearch;
  UserRepository.updateProfile = originalUpdateProfile;
  UserRepository.updatePassword = originalUpdatePassword;
  UserRepository.updateLastLoginAt = originalUpdateLastLoginAt;
  UserDeviceRepository.listByUser = originalUserDeviceListByUser;
  UserDeviceRepository.listLatestActivityByUsers =
    originalUserDeviceListLatestActivityByUsers;
  UserDeviceRepository.updateDeviceStatus =
    originalUserDeviceUpdateDeviceStatus;
  UserDeviceRepository.updateDevicesStatusByUser =
    originalUserDeviceUpdateDevicesStatusByUser;
  UserSessionRepository.countActiveSessionsByUser =
    originalUserSessionCountActiveSessionsByUser;
  UserSessionRepository.revokeSession = originalUserSessionRevokeSession;
  UserSessionRepository.revokeSessionsByUser =
    originalUserSessionRevokeSessionsByUser;
  wsServer.dispatchToUser = originalDispatchToUser;
  wsServer.getPresenceSummary = originalGetPresenceSummary;
  wsServer.getOnlineDeviceIds = originalGetOnlineDeviceIds;
  wsServer.disconnectUserDevices = originalDisconnectUserDevices;
  ContactService.lookupUserByPhone = originalLookupUserByPhone;
  ContactService.canDiscoverUser = originalCanDiscoverUser;
});

test.after(async () => {
  await cleanupRealtimeResources();
});

test("createUser hashes password and defaults nickname to username", async () => {
  let capturedArgs = null;
  PrivacyRepository.ensureForUser = async () => ({
    user_id: 1,
    discoverable_by_username: 0,
    discoverable_by_phone: 1,
    message_permission: 0
  });
  UserRepository.create = async (username, password, nickname) => {
    capturedArgs = { username, password, nickname };
    return {
      id: 1,
      username,
      password,
      nickname,
      gender: 0,
      is_deleted: false,
      created_at: new Date(),
      updated_at: new Date(),
      status: 0
    };
  };

  await UserService.createUser("alice", "plain-password");

  assert.equal(capturedArgs.username, "alice");
  assert.equal(capturedArgs.nickname, "alice");
  assert.notEqual(capturedArgs.password, "plain-password");
  assert.equal(
    await bcrypt.compare("plain-password", capturedArgs.password),
    true
  );
});

test("createUser preserves provided nickname", async () => {
  let capturedArgs = null;
  PrivacyRepository.ensureForUser = async () => ({
    user_id: 2,
    discoverable_by_username: 0,
    discoverable_by_phone: 1,
    message_permission: 0
  });
  UserRepository.create = async (username, password, nickname) => {
    capturedArgs = { username, password, nickname };
    return {
      id: 2,
      username,
      password,
      nickname,
      gender: 0,
      is_deleted: false,
      created_at: new Date(),
      updated_at: new Date(),
      status: 0
    };
  };

  await UserService.createUser("bob", "another-password", "Mushroom");

  assert.equal(capturedArgs.username, "bob");
  assert.equal(capturedArgs.nickname, "Mushroom");
  assert.equal(
    await bcrypt.compare("another-password", capturedArgs.password),
    true
  );
});

test("changePassword verifies current password, updates hash, and revokes other sessions", async () => {
  let updatePasswordArgs = null;
  let revokeArgs = null;
  let disconnectArgs = null;
  let auditArgs = null;
  const oldHash = await bcrypt.hash("123456", 4);

  UserRepository.findById = async userId => ({
    id: userId,
    username: "alice",
    password: oldHash,
    nickname: "Alice",
    gender: 0,
    is_deleted: false,
    created_at: new Date(),
    updated_at: new Date(),
    status: 0
  });
  pg.tx = async callback => callback({ mockTx: true });
  UserRepository.updatePassword = async (userId, password, tx) => {
    updatePasswordArgs = { userId, password, tx: Boolean(tx) };
  };
  UserSessionRepository.revokeSessionsByUser = async (userId, options) => {
    revokeArgs = { userId, options };
    return [{ session_id: "sid-2" }, { session_id: "sid-3" }];
  };
  wsServer.disconnectUserDevices = async (userId, options) => {
    disconnectArgs = { userId, options };
  };
  AuthAuditRepository.insert = async input => {
    auditArgs = input;
  };

  const result = await UserService.changePassword(
    7,
    "123456",
    "654321",
    "sid-1",
    "dev-1"
  );

  assert.equal(updatePasswordArgs.userId, 7);
  assert.equal(
    await bcrypt.compare("654321", updatePasswordArgs.password),
    true
  );
  assert.equal(updatePasswordArgs.tx, true);
  assert.deepEqual(revokeArgs, {
    userId: 7,
    options: {
      excludeSessionId: "sid-1",
      reason: "password_changed"
    }
  });
  assert.deepEqual(disconnectArgs, {
    userId: 7,
    options: {
      excludeDeviceId: "dev-1",
      reason: "password_changed"
    }
  });
  assert.equal(auditArgs.action, "password.change");
  assert.equal(auditArgs.action_status, 0);
  assert.equal(result.revoked_count, 2);
});

test("changePassword rejects incorrect current password", async () => {
  let auditArgs = null;
  UserRepository.findById = async userId => ({
    id: userId,
    username: "alice",
    password: await bcrypt.hash("123456", 4),
    nickname: "Alice",
    gender: 0,
    is_deleted: false,
    created_at: new Date(),
    updated_at: new Date(),
    status: 0
  });
  AuthAuditRepository.insert = async input => {
    auditArgs = input;
  };
  UserRepository.updatePassword = async () => {
    throw new Error("updatePassword should not be called");
  };

  await assert.rejects(
    () => UserService.changePassword(7, "bad-password", "654321", "sid-1"),
    /Current password is incorrect/
  );
  assert.equal(auditArgs.action, "password.change");
  assert.equal(auditArgs.action_status, 1);
});

test("updateProfile refreshes member caches and dispatches conversation sync", async () => {
  let capturedArgs = null;
  let refreshedProfileArgs = null;
  let touchedConversationIds = null;
  let insertedEvents = null;
  const dispatchedPayloads = [];

  UserRepository.updateProfile = async (userId, patch) => {
    capturedArgs = { userId, patch };
    return {
      id: userId,
      username: "alice",
      password: "hashed",
      nickname: patch.nickname,
      avatar_url: patch.avatar_url,
      signature: patch.signature,
      gender: 0,
      is_deleted: false,
      created_at: new Date(),
      updated_at: new Date(),
      status: 0
    };
  };
  pg.tx = async callback => callback({ mockTx: true });
  ConversationRepository.findActiveConversationIdsByUser = async () => [
    { conversation_id: "1001" },
    { conversation_id: "1002" }
  ];
  ConversationMemberRepository.refreshMemberProfileCache = async (
    tx,
    userId,
    patch
  ) => {
    refreshedProfileArgs = { tx: Boolean(tx), userId, patch };
  };
  ConversationRepository.touchConversations = async (tx, conversationIds) => {
    touchedConversationIds = { tx: Boolean(tx), conversationIds };
  };
  ConversationRepository.findConversationSyncTargets = async () => [
    { conversation_id: "1001", user_id: 3 },
    { conversation_id: "1001", user_id: 8 },
    { conversation_id: "1002", user_id: 3 }
  ];
  OutboxRepository.insertEvents = async (tx, events) => {
    insertedEvents = { tx: Boolean(tx), events };
  };
  wsServer.dispatchToUser = async (userId, payload) => {
    dispatchedPayloads.push({ userId, payload });
    return {
      mode: "local",
      localDeliveredCount: 1
    };
  };

  const updated = await UserService.updateProfile(3, {
    nickname: "Alice",
    avatar_url: "avatar.png",
    signature: "hello"
  });

  assert.deepEqual(capturedArgs, {
    userId: 3,
    patch: {
      nickname: "Alice",
      avatar_url: "avatar.png",
      signature: "hello"
    }
  });
  assert.deepEqual(refreshedProfileArgs, {
    tx: true,
    userId: 3,
    patch: {
      nickname: "Alice",
      avatar_url: "avatar.png"
    }
  });
  assert.deepEqual(touchedConversationIds, {
    tx: true,
    conversationIds: ["1001", "1002"]
  });
  assert.equal(insertedEvents.tx, true);
  assert.deepEqual(
    insertedEvents.events.map(item => ({
      event_type: item.event_type,
      conversation_id: item.conversation_id,
      target_user_id: item.target_user_id,
      payload: item.payload
    })),
    [
      {
        event_type: "conversation.sync",
        conversation_id: "1001",
        target_user_id: 3,
        payload: {
          messageClassify: "conversation_sync",
          action: "upsert",
          conversation_id: "1001"
        }
      },
      {
        event_type: "conversation.sync",
        conversation_id: "1001",
        target_user_id: 8,
        payload: {
          messageClassify: "conversation_sync",
          action: "upsert",
          conversation_id: "1001"
        }
      },
      {
        event_type: "conversation.sync",
        conversation_id: "1002",
        target_user_id: 3,
        payload: {
          messageClassify: "conversation_sync",
          action: "upsert",
          conversation_id: "1002"
        }
      }
    ]
  );
  assert.deepEqual(dispatchedPayloads, [
    {
      userId: 3,
      payload: {
        messageClassify: "conversation_sync",
        action: "upsert",
        conversation_id: "1001"
      }
    },
    {
      userId: 8,
      payload: {
        messageClassify: "conversation_sync",
        action: "upsert",
        conversation_id: "1001"
      }
    },
    {
      userId: 3,
      payload: {
        messageClassify: "conversation_sync",
        action: "upsert",
        conversation_id: "1002"
      }
    }
  ]);
  assert.equal(updated.nickname, "Alice");
  assert.equal(updated.avatar_url, "avatar.png");
  assert.equal(updated.signature, "hello");
});

test("updateProfile skips conversation sync when only signature changes", async () => {
  UserRepository.updateProfile = async (userId, patch) => ({
    id: userId,
    username: "alice",
    password: "hashed",
    nickname: "Alice",
    avatar_url: "avatar.png",
    signature: patch.signature,
    gender: 0,
    is_deleted: false,
    created_at: new Date(),
    updated_at: new Date(),
    status: 0
  });
  pg.tx = async callback => callback({ mockTx: true });

  let touched = false;
  let inserted = false;
  let dispatched = false;
  ConversationRepository.findActiveConversationIdsByUser = async () => {
    touched = true;
    return [];
  };
  OutboxRepository.insertEvents = async () => {
    inserted = true;
  };
  wsServer.dispatchToUser = async () => {
    dispatched = true;
    return {
      mode: "local",
      localDeliveredCount: 1
    };
  };

  const updated = await UserService.updateProfile(3, {
    signature: "hello"
  });

  assert.equal(touched, false);
  assert.equal(inserted, false);
  assert.equal(dispatched, false);
  assert.equal(updated.signature, "hello");
});

test("markLogin updates repository timestamp", async () => {
  let capturedUserId = null;
  UserRepository.updateLastLoginAt = async userId => {
    capturedUserId = userId;
  };

  await UserService.markLogin(7);

  assert.equal(capturedUserId, 7);
});

test("getSessionSummary returns separate last login and last active timestamps", async () => {
  UserRepository.findById = async userId => ({
    id: userId,
    username: "carol",
    password: "hashed",
    nickname: "Carol",
    gender: 0,
    is_deleted: false,
    created_at: new Date(),
    updated_at: new Date(),
    last_login_at: new Date("2026-03-29T12:00:00.000Z"),
    status: 0
  });
  wsServer.getPresenceSummary = async userId => ({
    is_online: userId === 9,
    active_device_count: 2
  });
  UserDeviceRepository.listLatestActivityByUsers = async () => [
    {
      user_id: 9,
      last_active_at: new Date("2026-03-30T08:30:00.000Z")
    }
  ];

  const summary = await UserService.getSessionSummary(9);

  assert.equal(summary.is_online, true);
  assert.equal(summary.active_device_count, 2);
  assert.equal(summary.last_login_at, "2026-03-29T12:00:00.000Z");
  assert.equal(summary.last_active_at, "2026-03-30T08:30:00.000Z");
});

test("getUsersPresence returns presence entries keyed by user id", async () => {
  UserRepository.findById = async userId => ({
    id: userId,
    username: `user-${userId}`,
    password: "hashed",
    nickname: `User ${userId}`,
    gender: 0,
    is_deleted: false,
    created_at: new Date(),
    updated_at: new Date(),
    last_login_at:
      userId === 9 ? new Date("2026-03-29T12:00:00.000Z") : undefined,
    status: 0
  });
  wsServer.getPresenceSummary = async userId => ({
    is_online: userId === 9,
    active_device_count: userId === 9 ? 2 : 0
  });
  UserDeviceRepository.listLatestActivityByUsers = async () => [
    {
      user_id: 9,
      last_active_at: new Date("2026-03-30T08:30:00.000Z")
    },
    {
      user_id: 11,
      last_active_at: new Date("2026-03-28T16:00:00.000Z")
    }
  ];
  // 让 visibility 上下文走"全部公开 (presence_visibility=0)"分支，
  // 这样无论 viewer 是否把 target 加为联系人，都能拿到原始 presence。
  const originalFindManyByUserIds = PrivacyRepository.findManyByUserIds;
  const originalListSavedContactIds = ContactRepository.listSavedContactIds;
  PrivacyRepository.findManyByUserIds = async userIds =>
    userIds.map(uid => ({ user_id: uid, presence_visibility: 0 }));
  ContactRepository.listSavedContactIds = async () => [];

  const viewerUserId = 1;
  const result = await PresenceService.getUsersPresence(
    viewerUserId,
    [9, 11, 9]
  );

  PrivacyRepository.findManyByUserIds = originalFindManyByUserIds;
  ContactRepository.listSavedContactIds = originalListSavedContactIds;

  // 实现透传 observed_at（生产路径由 wsServer.getPresenceSummary 提供），本测试 mock 中未返回，所以为 undefined。
  // 用 map 抹平字段对比，避免对 observed_at 的强约束。
  const stripped = result.map(({ observed_at: _ignored, ...rest }) => rest);
  assert.deepEqual(stripped, [
    {
      user_id: 9,
      is_online: true,
      active_device_count: 2,
      last_active_at: "2026-03-30T08:30:00.000Z"
    },
    {
      user_id: 11,
      is_online: false,
      active_device_count: 0,
      last_active_at: "2026-03-28T16:00:00.000Z"
    }
  ]);
});

test("getManagedDevices includes online flag and active session count", async () => {
  UserDeviceRepository.listByUser = async () => [
    {
      id: 1,
      user_id: 9,
      device_id: "dev-1",
      device_type: 2,
      device_name: "Mac",
      push_token: null,
      app_version: "1.0.0",
      last_seen_at: new Date("2026-04-01T10:00:00.000Z"),
      last_login_at: new Date("2026-04-01T09:00:00.000Z"),
      last_ip: "127.0.0.1",
      status: 1,
      metadata: { platform: "darwin" },
      created_at: new Date(),
      updated_at: new Date()
    },
    {
      id: 2,
      user_id: 9,
      device_id: "dev-2",
      device_type: 3,
      device_name: "Phone",
      push_token: null,
      app_version: "1.0.1",
      last_seen_at: new Date("2026-04-01T08:00:00.000Z"),
      last_login_at: new Date("2026-04-01T07:00:00.000Z"),
      last_ip: "127.0.0.2",
      status: 2,
      metadata: null,
      created_at: new Date(),
      updated_at: new Date()
    }
  ];
  UserSessionRepository.countActiveSessionsByUser = async () => [
    { device_id: "dev-1", active_session_count: 2 },
    { device_id: "dev-2", active_session_count: 0 }
  ];
  wsServer.getOnlineDeviceIds = async () => ["dev-1"];

  const result = await UserDeviceService.getManagedDevices(9, "dev-1");

  assert.equal(result.current_device_id, "dev-1");
  assert.equal(result.devices[0].is_current_device, true);
  assert.equal(result.devices[0].is_online, true);
  assert.equal(result.devices[0].active_session_count, 2);
  assert.equal(result.devices[1].is_online, false);
  assert.equal(result.devices[1].active_session_count, 0);
});

test("disableDevice revokes sessions, disconnects sockets, and records audit", async () => {
  let disconnected = null;
  let auditPayload = null;

  UserDeviceRepository.updateDeviceStatus = async () => ({
    id: 1,
    user_id: 5,
    device_id: "dev-2",
    device_type: 2,
    device_name: "Laptop",
    push_token: null,
    app_version: "1.0.0",
    last_seen_at: new Date(),
    last_login_at: new Date(),
    last_ip: "127.0.0.1",
    status: 0,
    metadata: null,
    created_at: new Date(),
    updated_at: new Date()
  });
  UserSessionRepository.revokeSessionsByUser = async () => [
    { session_id: "s-1" },
    { session_id: "s-2" }
  ];
  wsServer.disconnectUserDevices = async (userId, options) => {
    disconnected = { userId, options };
    return { mode: "local", localDisconnectedCount: 1 };
  };
  AuthAuditRepository.insert = async payload => {
    auditPayload = payload;
    return {
      id: 1,
      user_id: payload.user_id,
      device_id: payload.device_id,
      session_id: payload.session_id,
      action: payload.action,
      action_status: payload.action_status,
      ip: null,
      user_agent: null,
      details: payload.details ?? null,
      created_at: new Date()
    };
  };

  const result = await UserDeviceService.disableDevice(
    5,
    "dev-2",
    "dev-1",
    "sid-1"
  );

  assert.deepEqual(disconnected, {
    userId: 5,
    options: {
      targetDeviceId: "dev-2",
      reason: "device_disabled"
    }
  });
  assert.equal(auditPayload.action, "device.disable");
  assert.deepEqual(auditPayload.details, {
    revoked_session_count: 2
  });
  assert.deepEqual(result, {
    updated: true,
    target_device_id: "dev-2",
    status: 0,
    current_device_id: "dev-1"
  });
});

test("getSecurityEvents maps audit records to API response shape", async () => {
  AuthAuditRepository.listByUser = async () => [
    {
      id: 7,
      user_id: 3,
      device_id: "dev-1",
      session_id: "sid-1",
      action: "token.refresh",
      action_status: 0,
      ip: "127.0.0.1",
      user_agent: "Mozilla/5.0",
      details: { rotated: true },
      created_at: new Date("2026-04-05T10:00:00.000Z")
    }
  ];

  const result = await UserService.getSecurityEvents(3, 10);

  assert.deepEqual(result, {
    events: [
      {
        id: 7,
        action: "token.refresh",
        action_status: 0,
        device_id: "dev-1",
        session_id: "sid-1",
        ip: "127.0.0.1",
        user_agent: "Mozilla/5.0",
        details: { rotated: true },
        created_at: "2026-04-05T10:00:00.000Z"
      }
    ]
  });
});

test("searchUsers with phone mode performs exact E.164 lookup", async () => {
  const user = {
    id: 42,
    username: "bob",
    nickname: "Bob",
    avatar_url: "",
    signature: "",
    gender: 0
  };
  let capturedArgs = null;
  ContactService.lookupUserByPhone = async (
    selfId,
    rawPhone,
    defaultCountryCode
  ) => {
    capturedArgs = { selfId, rawPhone, defaultCountryCode };
    return {
      matched: true,
      phoneE164: "+8613800138000",
      user,
      isAlreadyContact: true
    };
  };

  const result = await UserService.searchUsers("13800138000", 7, {
    mode: "phone",
    defaultCountryCode: "+86"
  });

  assert.deepEqual(capturedArgs, {
    selfId: 7,
    rawPhone: "13800138000",
    defaultCountryCode: "+86"
  });
  assert.deepEqual(result, [user]);
});

test("searchUsers phone mode returns empty for short / invalid numbers", async () => {
  let lookedUp = false;
  ContactService.lookupUserByPhone = async () => {
    lookedUp = true;
    return {
      matched: false,
      phoneE164: "",
      user: null,
      isAlreadyContact: false
    };
  };

  const short = await UserService.searchUsers("12", 7, { mode: "phone" });
  const withSign = await UserService.searchUsers("+86", 7, { mode: "phone" });

  assert.deepEqual(short, []);
  assert.deepEqual(withSign, []);
  assert.equal(lookedUp, false);
});

test("searchUsers username mode searches username substring with discovery filter", async () => {
  const users = [
    { id: 11, username: "alice", nickname: "Alice", avatar_url: "" },
    { id: 22, username: "alice2", nickname: "Alice2", avatar_url: "" }
  ];
  let searchKeyword = null;
  const filteredIds = [];
  UserRepository.search = async keyword => {
    searchKeyword = keyword;
    return users;
  };
  ContactService.canDiscoverUser = async (selfId, targetUserId) => {
    filteredIds.push(targetUserId);
    return targetUserId !== 22;
  };

  const result = await UserService.searchUsers("alice", 7, {
    mode: "username"
  });

  assert.equal(searchKeyword, "alice");
  assert.deepEqual(filteredIds, [11, 22]);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 11);
});

test("searchUsers auto-classifies digits as phone and letters as username", async () => {
  let phoneLookedUp = false;
  ContactService.lookupUserByPhone = async () => {
    phoneLookedUp = true;
    return {
      matched: false,
      phoneE164: "",
      user: null,
      isAlreadyContact: false
    };
  };
  UserRepository.search = async () => [];

  await UserService.searchUsers("13800138000", 7);
  assert.equal(phoneLookedUp, true);

  phoneLookedUp = false;
  await UserService.searchUsers("alice", 7);
  assert.equal(phoneLookedUp, false);
});
