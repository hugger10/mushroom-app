import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_OUTGOING_IN_FLIGHT_GRACE_MS,
  getOutgoingFailureDisplayText,
  isRetryableOutgoingError,
  shouldRetryOutgoingMessage
} from "../dist/index.mjs";

test("shouldRetryOutgoingMessage skips recently in-flight messages", () => {
  const now = Date.UTC(2026, 2, 29, 5, 0, 0);
  const updatedAt = new Date(now - 2_000).toISOString();

  assert.equal(
    shouldRetryOutgoingMessage(
      {
        status: 1,
        retry_count: 0,
        updated_at: updatedAt
      },
      now
    ),
    false
  );
});

test("shouldRetryOutgoingMessage retries stale in-flight messages", () => {
  const now = Date.UTC(2026, 2, 29, 5, 0, 0);
  const updatedAt = new Date(
    now - DEFAULT_OUTGOING_IN_FLIGHT_GRACE_MS - 1_000
  ).toISOString();

  assert.equal(
    shouldRetryOutgoingMessage(
      {
        status: 1,
        retry_count: 0,
        updated_at: updatedAt
      },
      now
    ),
    true
  );
});

test("shouldRetryOutgoingMessage respects next retry time and retry limit", () => {
  const now = Date.UTC(2026, 2, 29, 5, 0, 0);

  assert.equal(
    shouldRetryOutgoingMessage(
      {
        status: -1,
        retry_count: 3
      },
      now,
      { autoRetryLimit: 3 }
    ),
    false
  );

  assert.equal(
    shouldRetryOutgoingMessage(
      {
        status: -1,
        retry_count: 1,
        next_retry_at: new Date(now + 30_000).toISOString()
      },
      now
    ),
    false
  );
});

test("shouldRetryOutgoingMessage skips group mute business errors", () => {
  const now = Date.UTC(2026, 2, 29, 5, 0, 0);

  assert.equal(
    isRetryableOutgoingError("The group is muted for regular members"),
    false
  );
  assert.equal(
    isRetryableOutgoingError("You are currently muted in this group"),
    false
  );
  assert.equal(
    getOutgoingFailureDisplayText("The group is muted for regular members"),
    "群主已开启全员禁言，消息未发送"
  );
  assert.equal(
    getOutgoingFailureDisplayText("You are currently muted in this group"),
    "你已被禁言，消息未发送"
  );
  assert.equal(
    shouldRetryOutgoingMessage(
      {
        status: -1,
        retry_count: 0,
        last_error: "The group is muted for regular members"
      },
      now
    ),
    false
  );
});

test("shouldRetryOutgoingMessage skips blocked-message business errors", () => {
  const now = Date.UTC(2026, 2, 29, 5, 0, 0);

  assert.equal(
    isRetryableOutgoingError("对方已经将你拉黑，无法发送消息"),
    false
  );
  assert.equal(
    getOutgoingFailureDisplayText("你已拉黑对方，无法发送消息"),
    "你已经将对方屏蔽，消息未发送"
  );
  assert.equal(
    getOutgoingFailureDisplayText("对方已经将你拉黑，无法发送消息"),
    "对方已经将你屏蔽，消息未发送"
  );
  assert.equal(
    shouldRetryOutgoingMessage(
      {
        status: -1,
        retry_count: 0,
        last_error: "你已拉黑对方，无法发送消息"
      },
      now
    ),
    false
  );
});
