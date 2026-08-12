import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  assertMaxLength
} = require("../dist/server/src/handler/request_parser.js");
const {
  BusinessError
} = require("../dist/server/src/handler/business_error.js");
const profileControllerModule = require("../dist/server/src/controller/profile_controller.js");
const authControllerModule = require("../dist/server/src/controller/auth_controller.js");
const userServiceModule = require("../dist/server/src/service/user_service.js");

const { ProfileController } = profileControllerModule;
const { AuthController } = authControllerModule;
const UserService = userServiceModule.default;

const originalUpdateProfile = UserService.updateProfile;
const originalFindUserByUsername = UserService.findUserByUsername;
const originalCreateUser = UserService.createUser;

test.afterEach(() => {
  UserService.updateProfile = originalUpdateProfile;
  UserService.findUserByUsername = originalFindUserByUsername;
  UserService.createUser = originalCreateUser;
});

async function runWrapped(handler, req) {
  const res = {
    headersSent: false,
    sendResult(data) {
      this.sentResult = data;
    }
  };
  let nextError = null;
  await handler(req, res, error => {
    nextError = error;
  });
  if (nextError) {
    throw nextError;
  }
  return res.sentResult;
}

test("assertMaxLength throws for overlong values and passes for valid ones", () => {
  assert.throws(
    () => assertMaxLength("昵称", "x".repeat(33), 32),
    err =>
      err instanceof BusinessError && err.message === "昵称不能超过 32 个字符"
  );
  assert.doesNotThrow(() => assertMaxLength("昵称", "x".repeat(32), 32));
  assert.doesNotThrow(() => assertMaxLength("昵称", undefined, 32));
  assert.doesNotThrow(() => assertMaxLength("昵称", null, 32));
});

test("updateProfile rejects overlong profile fields", async () => {
  UserService.updateProfile = async () => ({});
  const baseReq = {
    JwtPayload: { userId: 1, username: "alice" },
    body: { nickname: "x".repeat(33) }
  };

  await assert.rejects(
    runWrapped(ProfileController.updateProfile, baseReq),
    /昵称不能超过 32 个字符/
  );

  await assert.rejects(
    runWrapped(ProfileController.updateProfile, {
      ...baseReq,
      body: { phone: "1".repeat(21) }
    }),
    /手机号不能超过 20 个字符/
  );

  await assert.rejects(
    runWrapped(ProfileController.updateProfile, {
      ...baseReq,
      body: { signature: "y".repeat(101) }
    }),
    /个性签名不能超过 100 个字符/
  );

  await assert.rejects(
    runWrapped(ProfileController.updateProfile, {
      ...baseReq,
      body: { email: `${"e".repeat(255)}@x.com` }
    }),
    /邮箱不能超过 255 个字符/
  );

  await assert.doesNotReject(
    runWrapped(ProfileController.updateProfile, {
      ...baseReq,
      body: { nickname: "正常的昵称" }
    })
  );
});

test("register rejects overlong username and nickname", async () => {
  UserService.findUserByUsername = async () => null;
  UserService.createUser = async () => ({});

  await assert.rejects(
    runWrapped(AuthController.register, {
      JwtPayload: { userId: 0 },
      body: { username: "u".repeat(21), password: "secret1" }
    }),
    /用户名不能超过 20 个字符/
  );

  await assert.rejects(
    runWrapped(AuthController.register, {
      JwtPayload: { userId: 0 },
      body: { username: "alice", password: "secret1", nickname: "n".repeat(33) }
    }),
    /昵称不能超过 32 个字符/
  );

  await assert.rejects(
    runWrapped(AuthController.register, {
      JwtPayload: { userId: 0 },
      body: { username: "alice", password: "p".repeat(65) }
    }),
    /密码不能超过 64 个字符/
  );

  await assert.doesNotReject(
    runWrapped(AuthController.register, {
      JwtPayload: { userId: 0 },
      body: { username: "alice", password: "secret1", nickname: "爱丽丝" }
    })
  );
});
