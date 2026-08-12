import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pgModule = require("../dist/server/src/db/pg.js");
const userDeviceRepositoryModule = require("../dist/server/src/repository/user_device_repository.js");

const pg = pgModule.default;
const UserDeviceRepository = userDeviceRepositoryModule.default;

const originalOneOrNone = pg.oneOrNone;
const originalOne = pg.one;

test.afterEach(() => {
  pg.oneOrNone = originalOneOrNone;
  pg.one = originalOne;
});

test("touchDeviceSeen only refreshes active devices", async () => {
  let capturedQuery = null;
  let capturedParams = null;

  pg.oneOrNone = async (query, params) => {
    capturedQuery = query;
    capturedParams = params;
    return null;
  };

  await UserDeviceRepository.touchDeviceSeen(7, "device-1", {
    last_ip: "127.0.0.1",
    metadata: { transport: "websocket" }
  });

  assert.match(capturedQuery, /AND status = 1/);
  assert.deepEqual(capturedParams, [
    7,
    "device-1",
    "127.0.0.1",
    null,
    null,
    null,
    JSON.stringify({ transport: "websocket" }),
    null
  ]);
});

test("upsertDevice preserves existing device_type when not provided", async () => {
  let capturedQuery = null;
  let capturedParams = null;

  pg.one = async (query, params) => {
    capturedQuery = query;
    capturedParams = params;
    return null;
  };

  // Second upsert without device_type (e.g. WS handshake registration) must
  // NOT clobber the existing device_type with the INSERT-side COALESCE 0.
  await UserDeviceRepository.upsertDevice({
    user_id: 7,
    device_id: "device-1",
    device_name: "SM-S9280 (Android 14)",
    push_provider: "fcm",
    push_token: "tok",
    metadata: { platform: "android" }
  });

  assert.match(
    capturedQuery,
    /CASE\s+WHEN \$3 IS NULL\s+THEN user_devices\.device_type\s+ELSE \$3\s+END/
  );
  assert.doesNotMatch(
    capturedQuery,
    /COALESCE\(EXCLUDED\.device_type, user_devices\.device_type\)/
  );
  // device_type param is null so the CASE branch keeps the stored value.
  assert.equal(capturedParams[2], null);
});

test("upsertDevice writes device_type when explicitly provided", async () => {
  let capturedParams = null;

  pg.one = async (_query, params) => {
    capturedParams = params;
    return null;
  };

  await UserDeviceRepository.upsertDevice({
    user_id: 7,
    device_id: "device-1",
    device_type: 3
  });

  assert.equal(capturedParams[2], 3);
});
