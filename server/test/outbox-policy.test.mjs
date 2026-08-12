import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  computeOutboxNextRetryAt,
  getOutboxHealthLevel
} = require("../dist/server/src/outbox/policy.js");

test("computeOutboxNextRetryAt uses exponential backoff and respects cap", () => {
  const nextRetryAt = computeOutboxNextRetryAt(3, {
    now: Date.UTC(2026, 2, 13, 10, 0, 0),
    maxRetryDelayMs: 5000
  });

  assert.equal(
    nextRetryAt.toISOString(),
    new Date(Date.UTC(2026, 2, 13, 10, 0, 5)).toISOString()
  );
});

test("getOutboxHealthLevel warns on retry or dead jobs", () => {
  assert.equal(
    getOutboxHealthLevel({
      pending: 0,
      dispatched: 10,
      retry: 1,
      processing: 0,
      dead: 0
    }),
    "warning"
  );

  assert.equal(
    getOutboxHealthLevel({
      pending: 0,
      dispatched: 10,
      retry: 0,
      processing: 0,
      dead: 1
    }),
    "warning"
  );
});

test("getOutboxHealthLevel warns on queue backlog thresholds", () => {
  assert.equal(
    getOutboxHealthLevel(
      {
        pending: 201,
        dispatched: 10,
        retry: 0,
        processing: 0,
        dead: 0
      },
      { pendingWarningThreshold: 200 }
    ),
    "warning"
  );

  assert.equal(
    getOutboxHealthLevel(
      {
        pending: 10,
        dispatched: 10,
        retry: 0,
        processing: 51,
        dead: 0
      },
      { processingWarningThreshold: 50 }
    ),
    "warning"
  );
});

test("getOutboxHealthLevel stays healthy for normal queue state", () => {
  assert.equal(
    getOutboxHealthLevel({
      pending: 3,
      dispatched: 12,
      retry: 0,
      processing: 1,
      dead: 0
    }),
    "healthy"
  );
});
