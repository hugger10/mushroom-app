import test from "node:test";
import assert from "node:assert/strict";
import {
  applyPrivacyVersion,
  shouldAcceptPrivacyUpdate
} from "../dist/index.mjs";

const baseSettings = {
  discoverable_by_username: 0,
  discoverable_by_phone: 0,
  message_permission: 0,
  presence_visibility: 0,
  read_receipts_visibility: 0
};

function envelope(version, overrides = {}) {
  return {
    settings: { ...baseSettings, ...overrides },
    version,
    updated_at: new Date(1_700_000_000_000 + version).toISOString()
  };
}

test("applyPrivacyVersion: current null accepts incoming", () => {
  const incoming = envelope(1);
  assert.equal(applyPrivacyVersion(null, incoming), incoming);
});

test("applyPrivacyVersion: higher version replaces", () => {
  const current = envelope(2);
  const incoming = envelope(3, { read_receipts_visibility: 2 });
  assert.equal(applyPrivacyVersion(current, incoming), incoming);
});

test("applyPrivacyVersion: equal version keeps current", () => {
  const current = envelope(2);
  const incoming = envelope(2, { read_receipts_visibility: 2 });
  assert.equal(applyPrivacyVersion(current, incoming), current);
});

test("applyPrivacyVersion: older version keeps current", () => {
  const current = envelope(5);
  const incoming = envelope(3, { read_receipts_visibility: 2 });
  assert.equal(applyPrivacyVersion(current, incoming), current);
});

test("shouldAcceptPrivacyUpdate matches applyPrivacyVersion semantics", () => {
  assert.equal(shouldAcceptPrivacyUpdate(null, envelope(1)), true);
  assert.equal(shouldAcceptPrivacyUpdate(envelope(2), envelope(3)), true);
  assert.equal(shouldAcceptPrivacyUpdate(envelope(2), envelope(2)), false);
  assert.equal(shouldAcceptPrivacyUpdate(envelope(5), envelope(3)), false);
});
