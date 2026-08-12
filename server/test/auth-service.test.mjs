import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const authAuditRepositoryModule = require("../dist/server/src/repository/auth_audit_repository.js");
const authServiceModule = require("../dist/server/src/service/auth_service.js");
const configModule = require("../dist/server/src/utils/config.js");
const userDeviceRepositoryModule = require("../dist/server/src/repository/user_device_repository.js");
const userRepositoryModule = require("../dist/server/src/repository/user_repository.js");
const userSessionRepositoryModule = require("../dist/server/src/repository/user_session_repository.js");

const AuthAuditRepository = authAuditRepositoryModule.default;
const AuthService = authServiceModule.default;
const { config } = configModule;
const UserDeviceRepository = userDeviceRepositoryModule.default;
const UserRepository = userRepositoryModule.default;
const UserSessionRepository = userSessionRepositoryModule.default;

const originalAuthAuditInsert = AuthAuditRepository.insert;
const originalFindById = UserRepository.findById;
const originalFindByUserAndDevice = UserDeviceRepository.findByUserAndDevice;
const originalCreate = UserSessionRepository.create;
const originalFindByRefreshTokenHash =
  UserSessionRepository.findByRefreshTokenHash;
const originalFindByPreviousRefreshTokenHash =
  UserSessionRepository.findByPreviousRefreshTokenHash;
const originalFindBySessionId = UserSessionRepository.findBySessionId;
const originalRotateSession = UserSessionRepository.rotateSession;
const originalTouchSession = UserSessionRepository.touchSession;
const originalRevokeSession = UserSessionRepository.revokeSession;

test.afterEach(() => {
  AuthAuditRepository.insert = originalAuthAuditInsert;
  UserRepository.findById = originalFindById;
  UserDeviceRepository.findByUserAndDevice = originalFindByUserAndDevice;
  UserSessionRepository.create = originalCreate;
  UserSessionRepository.findByRefreshTokenHash = originalFindByRefreshTokenHash;
  UserSessionRepository.findByPreviousRefreshTokenHash =
    originalFindByPreviousRefreshTokenHash;
  UserSessionRepository.findBySessionId = originalFindBySessionId;
  UserSessionRepository.rotateSession = originalRotateSession;
  UserSessionRepository.touchSession = originalTouchSession;
  UserSessionRepository.revokeSession = originalRevokeSession;
});

test("createLoginSession creates a persisted session and signs an access token", async () => {
  let createdSession = null;
  let auditPayload = null;

  UserSessionRepository.create = async payload => {
    createdSession = payload;
    return {
      id: 1,
      session_id: payload.session_id,
      user_id: payload.user_id,
      device_id: payload.device_id ?? null,
      refresh_token_hash: payload.refresh_token_hash,
      access_jti: payload.access_jti,
      issued_at: new Date(),
      expires_at: payload.expires_at,
      last_seen_at: new Date(),
      last_ip: payload.last_ip ?? null,
      user_agent: payload.user_agent ?? null,
      status: 0,
      revoked_at: null,
      revoke_reason: null,
      created_at: new Date(),
      updated_at: new Date()
    };
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
      ip: payload.ip ?? null,
      user_agent: payload.user_agent ?? null,
      details: payload.details ?? null,
      created_at: new Date()
    };
  };

  const result = await AuthService.createLoginSession({
    userId: 11,
    username: "alice",
    nickname: "Alice",
    deviceId: "dev-1",
    req: {
      headers: {
        "user-agent": "Mozilla/5.0",
        "x-forwarded-for": "127.0.0.1"
      },
      socket: { remoteAddress: "127.0.0.1" }
    }
  });

  assert.equal(result.token, result.access_token);
  assert.equal(typeof result.refresh_token, "string");
  assert.equal(result.expires_in, config.auth.accessTokenTtlSeconds);
  assert.equal(result.refresh_expires_in, config.auth.refreshTokenTtlSeconds);
  assert.equal(createdSession.user_id, 11);
  assert.equal(createdSession.device_id, "dev-1");
  assert.equal(createdSession.access_jti.length > 10, true);
  assert.equal(createdSession.refresh_token_hash.length, 64);
  assert.equal(auditPayload.action, "login");

  const payload = jwt.verify(result.access_token, config.SECRET);
  assert.equal(payload.userId, 11);
  assert.equal(payload.username, "alice");
  assert.equal(payload.device_id, "dev-1");
  assert.equal(payload.token_type, "access");
  assert.equal(typeof payload.sid, "string");
  assert.equal(typeof payload.jti, "string");
});

test("refreshTokens rotates refresh token and returns a new access token", async () => {
  let rotatedPayload = null;

  UserSessionRepository.findByRefreshTokenHash = async hash => {
    assert.equal(hash.length, 64);
    return {
      id: 1,
      session_id: "sid-1",
      user_id: 7,
      device_id: "dev-9",
      refresh_token_hash: hash,
      access_jti: "old-jti",
      issued_at: new Date(),
      expires_at: new Date(Date.now() + 60_000),
      last_seen_at: new Date(),
      last_ip: "127.0.0.1",
      user_agent: "Mozilla/5.0",
      status: 0,
      revoked_at: null,
      revoke_reason: null,
      created_at: new Date(),
      updated_at: new Date()
    };
  };
  UserDeviceRepository.findByUserAndDevice = async () => ({
    id: 1,
    user_id: 7,
    device_id: "dev-9",
    device_type: 2,
    device_name: "Laptop",
    push_token: null,
    app_version: "1.0.0",
    last_seen_at: new Date(),
    last_login_at: new Date(),
    last_ip: "127.0.0.1",
    status: 1,
    metadata: null,
    created_at: new Date(),
    updated_at: new Date()
  });
  UserRepository.findById = async id => ({
    id,
    username: "bob",
    password: "hashed",
    nickname: "Bob",
    gender: 0,
    is_deleted: false,
    created_at: new Date(),
    updated_at: new Date(),
    last_login_at: new Date(),
    status: 0
  });
  UserSessionRepository.rotateSession = async (sessionId, payload) => {
    rotatedPayload = { sessionId, payload };
    return {
      id: 1,
      session_id: sessionId,
      user_id: 7,
      device_id: "dev-9",
      refresh_token_hash: payload.refresh_token_hash,
      access_jti: payload.access_jti,
      issued_at: new Date(),
      expires_at: payload.expires_at,
      last_seen_at: new Date(),
      last_ip: payload.last_ip ?? null,
      user_agent: payload.user_agent ?? null,
      status: 0,
      revoked_at: null,
      revoke_reason: null,
      created_at: new Date(),
      updated_at: new Date()
    };
  };
  AuthAuditRepository.insert = async payload => ({
    id: 1,
    user_id: payload.user_id,
    device_id: payload.device_id,
    session_id: payload.session_id,
    action: payload.action,
    action_status: payload.action_status,
    ip: payload.ip ?? null,
    user_agent: payload.user_agent ?? null,
    details: payload.details ?? null,
    created_at: new Date()
  });

  const result = await AuthService.refreshTokens("refresh-token", {
    headers: {
      "user-agent": "Mozilla/5.0",
      "x-forwarded-for": "127.0.0.1"
    },
    socket: { remoteAddress: "127.0.0.1" }
  });

  assert.equal(rotatedPayload.sessionId, "sid-1");
  assert.equal(rotatedPayload.payload.refresh_token_hash.length, 64);
  assert.equal(typeof result.refresh_token, "string");

  const payload = jwt.verify(result.access_token, config.SECRET);
  assert.equal(payload.userId, 7);
  assert.equal(payload.username, "bob");
  assert.equal(payload.device_id, "dev-9");
  assert.equal(payload.sid, "sid-1");
  assert.equal(payload.token_type, "access");
});

test("refreshTokens rejects inactive users before rotating tokens", async () => {
  let rotateCalled = false;
  let auditPayload = null;

  UserSessionRepository.findByRefreshTokenHash = async hash => ({
    id: 1,
    session_id: "sid-inactive",
    user_id: 7,
    device_id: null,
    refresh_token_hash: hash,
    access_jti: "old-jti",
    issued_at: new Date(),
    expires_at: new Date(Date.now() + 60_000),
    last_seen_at: new Date(),
    last_ip: "127.0.0.1",
    user_agent: "Mozilla/5.0",
    status: 0,
    revoked_at: null,
    revoke_reason: null,
    created_at: new Date(),
    updated_at: new Date()
  });
  UserRepository.findById = async id => ({
    id,
    username: "bob",
    password: "hashed",
    nickname: "Bob",
    gender: 0,
    is_deleted: false,
    created_at: new Date(),
    updated_at: new Date(),
    last_login_at: new Date(),
    status: 1
  });
  UserSessionRepository.rotateSession = async () => {
    rotateCalled = true;
    return null;
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
      ip: payload.ip ?? null,
      user_agent: payload.user_agent ?? null,
      details: payload.details ?? null,
      created_at: new Date()
    };
  };

  await assert.rejects(
    () =>
      AuthService.refreshTokens("refresh-token", {
        headers: {},
        socket: { remoteAddress: "127.0.0.1" }
      }),
    /User account is not active/
  );

  assert.equal(rotateCalled, false);
  assert.equal(auditPayload.action, "token.refresh");
  assert.equal(auditPayload.details.reason, "user_inactive");
});

test("assertAccessContext rejects superseded sessions", async () => {
  UserDeviceRepository.findByUserAndDevice = async () => ({
    id: 1,
    user_id: 4,
    device_id: "dev-1",
    device_type: 2,
    device_name: "Laptop",
    push_token: null,
    app_version: "1.0.0",
    last_seen_at: new Date(),
    last_login_at: new Date(),
    last_ip: "127.0.0.1",
    status: 1,
    metadata: null,
    created_at: new Date(),
    updated_at: new Date()
  });
  UserSessionRepository.findBySessionId = async () => ({
    id: 1,
    session_id: "sid-1",
    user_id: 4,
    device_id: "dev-1",
    refresh_token_hash: "hash",
    access_jti: "latest-jti",
    issued_at: new Date(),
    expires_at: new Date(Date.now() + 60_000),
    last_seen_at: new Date(),
    last_ip: "127.0.0.1",
    user_agent: "Mozilla/5.0",
    status: 0,
    revoked_at: null,
    revoke_reason: null,
    created_at: new Date(),
    updated_at: new Date()
  });

  await assert.rejects(
    () =>
      AuthService.assertAccessContext({
        userId: 4,
        deviceId: "dev-1",
        sid: "sid-1",
        jti: "stale-jti"
      }),
    /Session has been superseded/
  );
});

test("assertAccessContext accepts previous_access_jti within grace window", async () => {
  UserDeviceRepository.findByUserAndDevice = async () => ({
    id: 1,
    user_id: 4,
    device_id: "dev-1",
    device_type: 2,
    device_name: "Laptop",
    push_token: null,
    app_version: "1.0.0",
    last_seen_at: new Date(),
    last_login_at: new Date(),
    last_ip: "127.0.0.1",
    status: 1,
    metadata: null,
    created_at: new Date(),
    updated_at: new Date()
  });
  UserSessionRepository.findBySessionId = async () => ({
    id: 1,
    session_id: "sid-grace-access",
    user_id: 4,
    device_id: "dev-1",
    refresh_token_hash: "hash",
    access_jti: "latest-jti",
    previous_access_jti: "previous-jti",
    previous_access_rotated_at: new Date(Date.now() - 5_000),
    issued_at: new Date(),
    expires_at: new Date(Date.now() + 60_000),
    last_seen_at: new Date(),
    last_ip: "127.0.0.1",
    user_agent: "Mozilla/5.0",
    status: 0,
    revoked_at: null,
    revoke_reason: null,
    created_at: new Date(),
    updated_at: new Date()
  });

  // Should NOT throw — request bearing the just-rotated jti is still
  // accepted within JWT_ACCESS_GRACE_SECONDS.
  await AuthService.assertAccessContext({
    userId: 4,
    deviceId: "dev-1",
    sid: "sid-grace-access",
    jti: "previous-jti"
  });
});

test("assertAccessContext rejects previous_access_jti after grace window", async () => {
  UserDeviceRepository.findByUserAndDevice = async () => ({
    id: 1,
    user_id: 4,
    device_id: "dev-1",
    device_type: 2,
    device_name: "Laptop",
    push_token: null,
    app_version: "1.0.0",
    last_seen_at: new Date(),
    last_login_at: new Date(),
    last_ip: "127.0.0.1",
    status: 1,
    metadata: null,
    created_at: new Date(),
    updated_at: new Date()
  });
  UserSessionRepository.findBySessionId = async () => ({
    id: 1,
    session_id: "sid-stale-access",
    user_id: 4,
    device_id: "dev-1",
    refresh_token_hash: "hash",
    access_jti: "latest-jti",
    previous_access_jti: "previous-jti",
    previous_access_rotated_at: new Date(
      Date.now() - (config.auth.accessGraceSeconds + 5) * 1000
    ),
    issued_at: new Date(),
    expires_at: new Date(Date.now() + 60_000),
    last_seen_at: new Date(),
    last_ip: "127.0.0.1",
    user_agent: "Mozilla/5.0",
    status: 0,
    revoked_at: null,
    revoke_reason: null,
    created_at: new Date(),
    updated_at: new Date()
  });

  await assert.rejects(
    () =>
      AuthService.assertAccessContext({
        userId: 4,
        deviceId: "dev-1",
        sid: "sid-stale-access",
        jti: "previous-jti"
      }),
    /Session has been superseded/
  );
});

test("assertAccessContext rejects unrelated jti even with previous_access_jti present", async () => {
  UserDeviceRepository.findByUserAndDevice = async () => ({
    id: 1,
    user_id: 4,
    device_id: "dev-1",
    device_type: 2,
    device_name: "Laptop",
    push_token: null,
    app_version: "1.0.0",
    last_seen_at: new Date(),
    last_login_at: new Date(),
    last_ip: "127.0.0.1",
    status: 1,
    metadata: null,
    created_at: new Date(),
    updated_at: new Date()
  });
  UserSessionRepository.findBySessionId = async () => ({
    id: 1,
    session_id: "sid-foreign",
    user_id: 4,
    device_id: "dev-1",
    refresh_token_hash: "hash",
    access_jti: "latest-jti",
    previous_access_jti: "previous-jti",
    previous_access_rotated_at: new Date(Date.now() - 1_000),
    issued_at: new Date(),
    expires_at: new Date(Date.now() + 60_000),
    last_seen_at: new Date(),
    last_ip: "127.0.0.1",
    user_agent: "Mozilla/5.0",
    status: 0,
    revoked_at: null,
    revoke_reason: null,
    created_at: new Date(),
    updated_at: new Date()
  });

  await assert.rejects(
    () =>
      AuthService.assertAccessContext({
        userId: 4,
        deviceId: "dev-1",
        sid: "sid-foreign",
        jti: "totally-unrelated-jti"
      }),
    /Session has been superseded/
  );
});

test("refreshTokens replays previous refresh token within the grace window", async () => {
  let rotateCalls = 0;
  const auditPayloads = [];

  UserSessionRepository.findByRefreshTokenHash = async () => null;
  UserSessionRepository.findByPreviousRefreshTokenHash = async hash => {
    assert.equal(hash.length, 64);
    return {
      id: 99,
      session_id: "sid-grace",
      user_id: 42,
      device_id: null,
      refresh_token_hash: "current-hash",
      previous_refresh_token_hash: hash,
      previous_refresh_rotated_at: new Date(Date.now() - 5_000),
      access_jti: "current-jti",
      issued_at: new Date(),
      expires_at: new Date(Date.now() + 60_000),
      last_seen_at: new Date(),
      last_ip: "127.0.0.1",
      user_agent: "Mozilla/5.0",
      status: 0,
      revoked_at: null,
      revoke_reason: null,
      created_at: new Date(),
      updated_at: new Date()
    };
  };
  UserRepository.findById = async id => ({
    id,
    username: "carol",
    password: "hashed",
    nickname: "Carol",
    gender: 0,
    is_deleted: false,
    created_at: new Date(),
    updated_at: new Date(),
    last_login_at: new Date(),
    status: 0
  });
  UserSessionRepository.rotateSession = async () => {
    rotateCalls += 1;
    return null;
  };
  AuthAuditRepository.insert = async payload => {
    auditPayloads.push(payload);
    return {
      id: 1,
      user_id: payload.user_id,
      device_id: payload.device_id,
      session_id: payload.session_id,
      action: payload.action,
      action_status: payload.action_status,
      ip: payload.ip ?? null,
      user_agent: payload.user_agent ?? null,
      details: payload.details ?? null,
      created_at: new Date()
    };
  };

  const result = await AuthService.refreshTokens("stale-refresh-token", {
    headers: {},
    socket: { remoteAddress: "127.0.0.1" }
  });

  assert.equal(rotateCalls, 0);
  assert.equal(result.refresh_token, "stale-refresh-token");
  const payload = jwt.verify(result.access_token, config.SECRET);
  assert.equal(payload.userId, 42);
  assert.equal(payload.sid, "sid-grace");
  assert.equal(payload.jti, "current-jti");
  assert.equal(auditPayloads.length, 1);
  assert.equal(auditPayloads[0].action, "token.refresh");
  assert.equal(auditPayloads[0].action_status, 0);
  assert.equal(auditPayloads[0].details.reason, "refresh_grace_replay");
});

test("refreshTokens rejects previous refresh token after the grace window", async () => {
  UserSessionRepository.findByRefreshTokenHash = async () => null;
  UserSessionRepository.findByPreviousRefreshTokenHash = async hash => ({
    id: 100,
    session_id: "sid-stale",
    user_id: 43,
    device_id: null,
    refresh_token_hash: "current-hash",
    previous_refresh_token_hash: hash,
    previous_refresh_rotated_at: new Date(
      Date.now() - (config.auth.refreshGraceSeconds + 5) * 1000
    ),
    access_jti: "current-jti",
    issued_at: new Date(),
    expires_at: new Date(Date.now() + 60_000),
    last_seen_at: new Date(),
    last_ip: "127.0.0.1",
    user_agent: "Mozilla/5.0",
    status: 0,
    revoked_at: null,
    revoke_reason: null,
    created_at: new Date(),
    updated_at: new Date()
  });
  AuthAuditRepository.insert = async () => ({});

  await assert.rejects(
    () =>
      AuthService.refreshTokens("expired-stale-token", {
        headers: {},
        socket: { remoteAddress: "127.0.0.1" }
      }),
    /Refresh token is invalid/
  );
});
