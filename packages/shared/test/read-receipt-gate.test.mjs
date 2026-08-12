import test from "node:test";
import assert from "node:assert/strict";
import {
  canRenderPeerReadReceipts,
  isReadReceiptsEnabled
} from "../dist/index.mjs";

test("canRenderPeerReadReceipts: undefined / null defaults to enabled", () => {
  assert.equal(canRenderPeerReadReceipts(undefined), true);
  assert.equal(canRenderPeerReadReceipts(null), true);
});

test("canRenderPeerReadReceipts: missing field defaults to enabled", () => {
  assert.equal(canRenderPeerReadReceipts({}), true);
});

test("canRenderPeerReadReceipts: value 0 enabled", () => {
  assert.equal(
    canRenderPeerReadReceipts({ read_receipts_visibility: 0 }),
    true
  );
});

test("canRenderPeerReadReceipts: value 1 enabled (contacts-only reserved)", () => {
  assert.equal(
    canRenderPeerReadReceipts({ read_receipts_visibility: 1 }),
    true
  );
});

test("canRenderPeerReadReceipts: value 2 disabled", () => {
  assert.equal(
    canRenderPeerReadReceipts({ read_receipts_visibility: 2 }),
    false
  );
});

test("isReadReceiptsEnabled is an alias", () => {
  assert.equal(isReadReceiptsEnabled(null), true);
  assert.equal(
    isReadReceiptsEnabled({
      discoverable_by_username: 0,
      discoverable_by_phone: 0,
      message_permission: 0,
      presence_visibility: 0,
      read_receipts_visibility: 2
    }),
    false
  );
});
