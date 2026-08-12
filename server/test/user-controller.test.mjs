import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const authServiceModule = require("../dist/server/src/service/auth_service.js");
const callRoomServiceModule = require("../dist/server/src/service/call_room_service.js");
const redisModule = require("../dist/server/src/cache/redis.js");
const authControllerModule = require("../dist/server/src/controller/auth_controller.js");
const callControllerModule = require("../dist/server/src/controller/call_controller.js");
const contactControllerModule = require("../dist/server/src/controller/contact_controller.js");
const deviceControllerModule = require("../dist/server/src/controller/device_controller.js");
const contactServiceModule = require("../dist/server/src/service/contact_service.js");
const userDeviceServiceModule = require("../dist/server/src/service/user_device_service.js");
const userServiceModule = require("../dist/server/src/service/user_service.js");
const wsModule = require("../dist/server/src/websocket/index.js");

const AuthService = authServiceModule.default;
const CallRoomService = callRoomServiceModule.default;
const redis = redisModule.getRedis();
const { AuthController } = authControllerModule;
const { CallController } = callControllerModule;
const { ContactController } = contactControllerModule;
const { DeviceController } = deviceControllerModule;
const ContactService = contactServiceModule.default;
const UserDeviceService = userDeviceServiceModule.default;
const UserService = userServiceModule.default;
const { wsServer } = wsModule;

const originals = {
  createLoginSession: AuthService.createLoginSession,
  ensureDeviceAllowedForLogin: AuthService.ensureDeviceAllowedForLogin,
  recordAudit: AuthService.recordAudit,
  refreshTokens: AuthService.refreshTokens,
  getGroupRoomConfig: CallRoomService.getGroupRoomConfig,
  registerLoginDevice: UserDeviceService.registerLoginDevice,
  logoutAllDevices: UserDeviceService.logoutAllDevices,
  disableDevice: UserDeviceService.disableDevice,
  createUser: UserService.createUser,
  findUserByUsername: UserService.findUserByUsername,
  markLogin: UserService.markLogin,
  changePassword: UserService.changePassword,
  getSecurityEvents: UserService.getSecurityEvents,
  lookupUserByPhone: ContactService.lookupUserByPhone
};

function createMockResponse() {
  return {
    headersSent: false,
    sentResult: undefined,
    sendResult(data) {
      this.sentResult = data;
    }
  };
}

async function runWrapped(handler, req) {
  const res = createMockResponse();
  let nextError = null;

  await handler(req, res, error => {
    nextError = error;
  });

  if (nextError) {
    throw nextError;
  }

  return res.sentResult;
}

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

test.afterEach(() => {
  AuthService.createLoginSession = originals.createLoginSession;
  AuthService.ensureDeviceAllowedForLogin =
    originals.ensureDeviceAllowedForLogin;
  AuthService.recordAudit = originals.recordAudit;
  AuthService.refreshTokens = originals.refreshTokens;
  CallRoomService.getGroupRoomConfig = originals.getGroupRoomConfig;
  UserDeviceService.registerLoginDevice = originals.registerLoginDevice;
  UserDeviceService.logoutAllDevices = originals.logoutAllDevices;
  UserDeviceService.disableDevice = originals.disableDevice;
  UserService.createUser = originals.createUser;
  UserService.findUserByUsername = originals.findUserByUsername;
  UserService.markLogin = originals.markLogin;
  UserService.changePassword = originals.changePassword;
  UserService.getSecurityEvents = originals.getSecurityEvents;
  ContactService.lookupUserByPhone = originals.lookupUserByPhone;
});

test.after(async () => {
  await cleanupRealtimeResources();
});

test("login delegates to AuthService session creation with device context", async () => {
  let ensureArgs = null;
  let registerArgs = null;
  let loginSessionArgs = null;
  let markLoginUserId = null;

  UserService.findUserByUsername = async username => ({
    id: 1,
    username,
    password: await bcrypt.hash("123456", 4),
    nickname: "Alice",
    gender: 0,
    is_deleted: false,
    created_at: new Date(),
    updated_at: new Date(),
    status: 0
  });
  AuthService.ensureDeviceAllowedForLogin = async (userId, deviceId) => {
    ensureArgs = { userId, deviceId };
  };
  UserService.markLogin = async userId => {
    markLoginUserId = userId;
  };
  UserDeviceService.registerLoginDevice = async (...args) => {
    registerArgs = args;
  };
  AuthService.createLoginSession = async args => {
    loginSessionArgs = args;
    return {
      token: "access-token",
      access_token: "access-token",
      refresh_token: "refresh-token",
      expires_in: 3600,
      refresh_expires_in: 86400
    };
  };

  const result = await runWrapped(AuthController.login, {
    body: {
      username: "alice",
      password: "123456",
      device: {
        device_id: "dev-1"
      }
    },
    headers: {},
    socket: { remoteAddress: "127.0.0.1" }
  });

  assert.deepEqual(ensureArgs, {
    userId: 1,
    deviceId: "dev-1"
  });
  assert.equal(markLoginUserId, 1);
  assert.equal(registerArgs[0], 1);
  assert.equal(loginSessionArgs.userId, 1);
  assert.equal(loginSessionArgs.deviceId, "dev-1");
  assert.equal(result.access_token, "access-token");
});

test("login rejects inactive user accounts before creating sessions", async () => {
  let auditPayload = null;
  let loginSessionCalled = false;

  UserService.findUserByUsername = async username => ({
    id: 1,
    username,
    password: await bcrypt.hash("123456", 4),
    nickname: "Alice",
    gender: 0,
    is_deleted: false,
    created_at: new Date(),
    updated_at: new Date(),
    status: 1
  });
  AuthService.recordAudit = async (_req, payload) => {
    auditPayload = payload;
  };
  AuthService.createLoginSession = async () => {
    loginSessionCalled = true;
    throw new Error("createLoginSession should not be called");
  };

  await assert.rejects(
    () =>
      runWrapped(AuthController.login, {
        body: {
          username: "alice",
          password: "123456",
          device: {
            device_id: "dev-1"
          }
        },
        headers: {},
        socket: { remoteAddress: "127.0.0.1" }
      }),
    /User account is not active/
  );

  assert.equal(loginSessionCalled, false);
  assert.equal(auditPayload.action, "login");
  assert.equal(auditPayload.actionStatus, 1);
  assert.equal(auditPayload.details.reason, "user_inactive");
});

test("refresh forwards refresh token request to AuthService", async () => {
  let refreshArgs = null;
  AuthService.refreshTokens = async (refreshToken, req) => {
    refreshArgs = { refreshToken, req };
    return {
      token: "access-token",
      access_token: "access-token",
      refresh_token: "refresh-token",
      expires_in: 3600,
      refresh_expires_in: 86400
    };
  };

  const req = {
    body: {
      refresh_token: "refresh-token"
    },
    headers: {},
    socket: { remoteAddress: "127.0.0.1" }
  };
  const result = await runWrapped(AuthController.refresh, req);

  assert.equal(refreshArgs.refreshToken, "refresh-token");
  assert.equal(refreshArgs.req, req);
  assert.equal(result.refresh_token, "refresh-token");
});

test("changePassword forwards credentials and current session context", async () => {
  let changePasswordArgs = null;
  UserService.changePassword = async (...args) => {
    changePasswordArgs = args;
    return {
      updated: true,
      revoked_count: 2
    };
  };

  const result = await runWrapped(AuthController.changePassword, {
    body: {
      current_password: "123456",
      new_password: "654321"
    },
    JwtPayload: {
      userId: 7,
      sid: "sid-1",
      deviceId: "dev-1"
    }
  });

  assert.deepEqual(changePasswordArgs, [
    7,
    "123456",
    "654321",
    "sid-1",
    "dev-1"
  ]);
  assert.deepEqual(result, {
    updated: true,
    revoked_count: 2
  });
});

test("logoutAll forwards sid, device, and keep_current to service", async () => {
  let logoutAllArgs = null;
  UserDeviceService.logoutAllDevices = async (...args) => {
    logoutAllArgs = args;
    return {
      revoked_count: 2,
      current_device_id: "dev-1"
    };
  };

  const result = await runWrapped(DeviceController.logoutAll, {
    body: {
      keep_current: 1
    },
    JwtPayload: {
      userId: 7,
      sid: "sid-1",
      deviceId: "dev-1"
    }
  });

  assert.deepEqual(logoutAllArgs, [7, "sid-1", "dev-1", true]);
  assert.equal(result.revoked_count, 2);
});

test("disableDevice forwards ids to service and returns response", async () => {
  let disableArgs = null;
  UserDeviceService.disableDevice = async (...args) => {
    disableArgs = args;
    return {
      updated: true,
      target_device_id: "dev-2",
      status: 0,
      current_device_id: "dev-1"
    };
  };

  const result = await runWrapped(DeviceController.disableDevice, {
    body: {
      device_id: "dev-2"
    },
    JwtPayload: {
      userId: 7,
      sid: "sid-1",
      deviceId: "dev-1"
    }
  });

  assert.deepEqual(disableArgs, [7, "dev-2", "dev-1", "sid-1"]);
  assert.equal(result.status, 0);
});

test("getSecurityEvents clamps limit and returns service payload", async () => {
  let capturedLimit = null;
  UserService.getSecurityEvents = async (userId, limit) => {
    capturedLimit = { userId, limit };
    return {
      events: []
    };
  };

  const result = await runWrapped(AuthController.getSecurityEvents, {
    query: {
      limit: "500"
    },
    JwtPayload: {
      userId: 9
    }
  });

  assert.deepEqual(capturedLimit, {
    userId: 9,
    limit: 100
  });
  assert.deepEqual(result, { events: [] });
});

test("getCallRoomConfig forwards call id and device context to service", async () => {
  let capturedArgs = null;
  CallRoomService.getGroupRoomConfig = async args => {
    capturedArgs = args;
    return {
      provider: "livekit",
      issued_at: "2026-04-07T09:00:00.000Z",
      ttl_seconds: 3600,
      server_url: "wss://livekit.example.test",
      room_name: "call-room-1",
      access_token: "token-1",
      participant_identity: "call-room-1:9:device-1",
      participant_name: "user-9",
      max_participants: 8,
      metadata: {
        call_id: "call-room-1"
      }
    };
  };

  const result = await runWrapped(CallController.getCallRoomConfig, {
    query: {
      callId: "call-room-1"
    },
    JwtPayload: {
      userId: 9,
      deviceId: "device-1"
    }
  });

  assert.deepEqual(capturedArgs, {
    callId: "call-room-1",
    userId: 9,
    deviceId: "device-1"
  });
  assert.equal(result.room_name, "call-room-1");
});

test("lookupContactByPhone forwards phone and default country code to service", async () => {
  let capturedArgs = null;
  ContactService.lookupUserByPhone = async (...args) => {
    capturedArgs = args;
    return {
      matched: true,
      phoneE164: "+8613800138000",
      user: {
        id: 42,
        username: "bob",
        nickname: "Bob",
        avatar_url: "",
        signature: "",
        gender: 0
      },
      isAlreadyContact: false
    };
  };

  const result = await runWrapped(ContactController.lookupContactByPhone, {
    body: {
      phone_e164: "13800138000",
      default_country_code: "+86"
    },
    JwtPayload: {
      userId: 7
    }
  });

  assert.deepEqual(capturedArgs, [7, "13800138000", "+86"]);
  assert.equal(result.matched, true);
  assert.equal(result.phone_e164, "+8613800138000");
  assert.equal(result.user.user_id, 42);
  assert.equal(result.user.username, "bob");
  assert.equal(result.user.is_already_contact, false);
});

test("lookupContactByPhone marks already-saved contacts", async () => {
  ContactService.lookupUserByPhone = async () => ({
    matched: true,
    phoneE164: "+8613800138000",
    user: {
      id: 42,
      username: "bob",
      nickname: "Bob",
      avatar_url: "",
      signature: "",
      gender: 0
    },
    isAlreadyContact: true
  });

  const result = await runWrapped(ContactController.lookupContactByPhone, {
    body: { phone_e164: "+8613800138000" },
    JwtPayload: { userId: 7 }
  });

  assert.equal(result.matched, true);
  assert.equal(result.user.is_already_contact, true);
});

test("lookupContactByPhone returns matched=false without user payload", async () => {
  ContactService.lookupUserByPhone = async () => ({
    matched: false,
    phoneE164: "+8613800138000",
    user: null,
    isAlreadyContact: false
  });

  const result = await runWrapped(ContactController.lookupContactByPhone, {
    body: {
      phone_e164: "+8613800138000"
    },
    JwtPayload: {
      userId: 7
    }
  });

  assert.equal(result.matched, false);
  assert.equal(result.phone_e164, "+8613800138000");
  assert.equal(result.user, undefined);
});

test("lookupContactByPhone rejects when phone_e164 is missing", async () => {
  await assert.rejects(
    () =>
      runWrapped(ContactController.lookupContactByPhone, {
        body: {},
        JwtPayload: { userId: 7 }
      }),
    /phone_e164 is required/
  );
});
