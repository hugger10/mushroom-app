import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const payloadLoggerModule = require("../dist/server/src/utils/payload_logger.js");
const loggerModule = require("../dist/server/src/utils/logger.js");

const {
  logPayload,
  isPayloadLoggingEnabled,
  __reloadPayloadLoggerConfigForTest
} = payloadLoggerModule;
const logger = loggerModule.default;

function captureTrace(fn) {
  const captured = [];
  const original = logger.trace;
  logger.trace = function (obj, msg) {
    captured.push({ obj, msg });
  };
  try {
    fn();
  } finally {
    logger.trace = original;
  }
  return captured;
}

const ENV_KEYS = [
  "LOG_PAYLOAD_ENABLED",
  "LOG_PAYLOAD_SCOPES",
  "LOG_PAYLOAD_MAX_BYTES",
  "LOG_PAYLOAD_SAMPLE_RATE",
  "LOG_PAYLOAD_USER_ALLOWLIST",
  "LOG_PAYLOAD_REDACT_KEYS"
];

function snapshotEnv() {
  const snap = {};
  for (const k of ENV_KEYS) snap[k] = process.env[k];
  return snap;
}

function restoreEnv(snap) {
  for (const k of ENV_KEYS) {
    if (snap[k] === undefined) delete process.env[k];
    else process.env[k] = snap[k];
  }
  __reloadPayloadLoggerConfigForTest();
}

test("logPayload is a noop when disabled by default", () => {
  const snap = snapshotEnv();
  try {
    delete process.env.LOG_PAYLOAD_ENABLED;
    __reloadPayloadLoggerConfigForTest();
    assert.equal(isPayloadLoggingEnabled(), false);
    const captured = captureTrace(() => {
      logPayload({ scope: "ws.chat.in" }, { hello: "world" });
    });
    assert.equal(captured.length, 0);
  } finally {
    restoreEnv(snap);
  }
});

test("logPayload redacts sensitive keys and truncates oversized payload", () => {
  const snap = snapshotEnv();
  try {
    process.env.LOG_PAYLOAD_ENABLED = "true";
    process.env.LOG_PAYLOAD_MAX_BYTES = "40";
    process.env.LOG_PAYLOAD_SCOPES = "";
    __reloadPayloadLoggerConfigForTest();
    const captured = captureTrace(() => {
      logPayload(
        { scope: "ws.chat.in", userId: 7 },
        {
          password: "supersecret",
          token: "abc",
          body: "x".repeat(200)
        }
      );
    });
    assert.equal(captured.length, 1);
    const [entry] = captured;
    assert.equal(entry.obj.scope, "ws.chat.in");
    assert.equal(entry.obj.userId, 7);
    assert.equal(entry.obj.truncated, true);
    assert.ok(entry.obj.payload.length <= 40);
    assert.ok(!entry.obj.payload.includes("supersecret"));
  } finally {
    restoreEnv(snap);
  }
});

test("logPayload filters by scope allowlist", () => {
  const snap = snapshotEnv();
  try {
    process.env.LOG_PAYLOAD_ENABLED = "true";
    process.env.LOG_PAYLOAD_SCOPES = "push.envelope";
    __reloadPayloadLoggerConfigForTest();
    const captured = captureTrace(() => {
      logPayload({ scope: "ws.chat.in" }, { a: 1 });
      logPayload({ scope: "push.envelope" }, { b: 2 });
    });
    assert.equal(captured.length, 1);
    assert.equal(captured[0].obj.scope, "push.envelope");
  } finally {
    restoreEnv(snap);
  }
});
