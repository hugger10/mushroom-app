// Unit tests for the shared device-identity helpers (packages/app-core).

import { test } from "node:test";
import { strict as assert } from "node:assert";

import {
  buildDeviceName,
  buildVendorLabel,
  createDeviceId,
  isUuidV4
} from "../src/index.ts";

test("isUuidV4 accepts a real UUID v4", () => {
  assert.equal(isUuidV4("b0c0d7c9-2a5e-4b6f-8d3a-9e8f7a6b5c4d"), true);
});

test("isUuidV4 rejects legacy rn-prefixed ids", () => {
  assert.equal(isUuidV4("rn-android-1718000000000-a1b2c3d4"), false);
  assert.equal(isUuidV4(""), false);
  assert.equal(isUuidV4("not-a-uuid"), false);
});

test("isUuidV4 rejects non-v4 uuids (wrong version/variant nibbles)", () => {
  // version must be 4
  assert.equal(isUuidV4("b0c0d7c9-2a5e-1b6f-8d3a-9e8f7a6b5c4d"), false);
  // variant must be 8/9/a/b
  assert.equal(isUuidV4("b0c0d7c9-2a5e-4b6f-7d3a-9e8f7a6b5c4d"), false);
});

test("createDeviceId returns a valid UUID v4", () => {
  for (let index = 0; index < 200; index += 1) {
    const id = createDeviceId();
    assert.equal(isUuidV4(id), true, `generated id should be v4: ${id}`);
  }
});

test("createDeviceId produces distinct ids", () => {
  const seen = new Set();
  for (let index = 0; index < 100; index += 1) {
    seen.add(createDeviceId());
  }
  assert.equal(seen.size, 100);
});

test("buildDeviceName renders mobile-style device names", () => {
  assert.equal(
    buildDeviceName({
      model: "iPhone 15 Pro",
      osName: "iOS",
      osVersion: "17.5"
    }),
    "iPhone 15 Pro (iOS 17.5)"
  );
  assert.equal(
    buildDeviceName({
      model: "SM-S9280",
      osName: "Android",
      osVersion: "14"
    }),
    "SM-S9280 (Android 14)"
  );
});

test("buildDeviceName prefixes Android manufacturer (Telegram style)", () => {
  assert.equal(
    buildDeviceName({
      vendor: "Xiaomi",
      model: "24094RAD4C",
      osName: "Android",
      osVersion: "16"
    }),
    "Xiaomi 24094RAD4C (Android 16)"
  );
  assert.equal(
    buildDeviceName({
      vendor: "Redmi Xiaomi",
      model: "24094RAD4C",
      osName: "Android",
      osVersion: "16"
    }),
    "Redmi Xiaomi 24094RAD4C (Android 16)"
  );
  assert.equal(
    buildDeviceName({
      vendor: "Xiaomi",
      model: "24094RAD4C"
    }),
    "Xiaomi 24094RAD4C"
  );
});

test("buildVendorLabel joins distinct brand and manufacturer", () => {
  assert.equal(buildVendorLabel("Redmi", "Xiaomi"), "Redmi Xiaomi");
  assert.equal(buildVendorLabel("samsung", "samsung"), "samsung");
});

test("buildVendorLabel dedups identical brand/manufacturer case-insensitively", () => {
  assert.equal(buildVendorLabel("HUAWEI", "HUAWEI"), "HUAWEI");
  assert.equal(buildVendorLabel("Xiaomi", "xiaomi"), "Xiaomi");
});

test("buildVendorLabel handles single or missing values", () => {
  assert.equal(buildVendorLabel("Redmi", null), "Redmi");
  assert.equal(buildVendorLabel(null, "Xiaomi"), "Xiaomi");
  assert.equal(buildVendorLabel("", "  "), null);
  assert.equal(buildVendorLabel(null, null), null);
  assert.equal(buildVendorLabel(undefined, undefined), null);
});

test("buildDeviceName does not duplicate vendor when model already prefixed", () => {
  assert.equal(
    buildDeviceName({
      vendor: "Apple",
      model: "Apple iPhone 15 Pro",
      osName: "iOS",
      osVersion: "17.5"
    }),
    "Apple iPhone 15 Pro (iOS 17.5)"
  );
  assert.equal(
    buildDeviceName({
      vendor: "Xiaomi",
      model: "xiaomi 24094RAD4C",
      osName: "Android",
      osVersion: "16"
    }),
    "xiaomi 24094RAD4C (Android 16)"
  );
});

test("buildDeviceName degrades gracefully when fields are missing", () => {
  assert.equal(buildDeviceName({ model: "SM-S9280" }), "SM-S9280");
  assert.equal(buildDeviceName({ osName: "iOS" }), "iOS");
  assert.equal(
    buildDeviceName({ model: "  ", osName: "", osVersion: null }),
    "Unknown Device"
  );
  assert.equal(
    buildDeviceName({ model: "  ", fallback: "RN Mobile" }),
    "RN Mobile"
  );
});
