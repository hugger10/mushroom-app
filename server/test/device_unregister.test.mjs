import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pgModule = require("../dist/server/src/db/pg.js");
const userDeviceRepositoryModule = require("../dist/server/src/repository/user_device_repository.js");
const userDeviceServiceModule = require("../dist/server/src/service/user_device_service.js");
const authControllerModule = require("../dist/server/src/controller/auth_controller.js");

const pg = pgModule.default;
const UserDeviceRepository = userDeviceRepositoryModule.default;
const UserDeviceService = userDeviceServiceModule.default;
const AuthController =
  authControllerModule.AuthController ?? authControllerModule.default;

const originalOneOrNone = pg.oneOrNone;

test.afterEach(() => {
  pg.oneOrNone = originalOneOrNone;
});

test("unregisterPushAndLogout NULLs push_token and sets status=2", async () => {
  let capturedQuery = null;
  let capturedParams = null;

  pg.oneOrNone = async (query, params) => {
    capturedQuery = query;
    capturedParams = params;
    return {
      id: 1,
      user_id: 42,
      device_id: "dev-1",
      push_token: null,
      status: 2
    };
  };

  const updated = await UserDeviceRepository.unregisterPushAndLogout(
    42,
    "dev-1"
  );

  assert.match(capturedQuery, /UPDATE user_devices/);
  assert.match(capturedQuery, /push_token\s*=\s*NULL/);
  assert.match(capturedQuery, /status\s*=\s*2/);
  assert.deepEqual(capturedParams, [42, "dev-1"]);
  assert.equal(updated.status, 2);
  assert.equal(updated.push_token, null);
});

test("UserDeviceService.unregisterPushForCurrentDevice delegates to repository", async () => {
  pg.oneOrNone = async () => ({ id: 1, user_id: 7, device_id: "d", status: 2 });
  const updated = await UserDeviceService.unregisterPushForCurrentDevice(
    7,
    "d"
  );
  assert.ok(updated);
  assert.equal(updated.status, 2);
});

test("controller.unregisterCurrentDevice returns updated=false when JWT has no deviceId", async () => {
  let called = false;
  pg.oneOrNone = async () => {
    called = true;
    return null;
  };

  const fakeReq = { JwtPayload: { userId: 1, deviceId: null }, body: {} };
  let sent = null;
  const res = {
    status() {
      return this;
    },
    json() {
      return this;
    },
    sendResult(payload) {
      sent = payload;
      return this;
    }
  };
  await AuthController.unregisterCurrentDevice(fakeReq, res, () => {});
  assert.equal(called, false);
  assert.deepEqual(sent?.data ?? sent, { updated: false });
});

test("controller.unregisterCurrentDevice calls repo when deviceId present", async () => {
  let called = false;
  pg.oneOrNone = async (_q, params) => {
    called = true;
    assert.deepEqual(params, [9, "dev-9"]);
    return {
      id: 2,
      user_id: 9,
      device_id: "dev-9",
      status: 2,
      push_token: null
    };
  };

  const fakeReq = { JwtPayload: { userId: 9, deviceId: "dev-9" }, body: {} };
  let sent = null;
  const res = {
    status() {
      return this;
    },
    json() {
      return this;
    },
    sendResult(payload) {
      sent = payload;
      return this;
    }
  };
  await AuthController.unregisterCurrentDevice(fakeReq, res, () => {});
  assert.equal(called, true);
  assert.deepEqual(sent?.data ?? sent, { updated: true });
});
