import test from "node:test";
import assert from "node:assert/strict";
import {
  CALL_MEDIA_TYPE_AUDIO,
  CALL_MEDIA_TYPE_VIDEO,
  CALL_SCOPE_DIRECT,
  CALL_SCOPE_GROUP,
  CALL_STATUS_ENDED,
  CALL_STATUS_INITIATED,
  CALL_STATUS_ONGOING,
  CALL_STATUS_RINGING
} from "../dist/index.mjs";

test("shared root entry exports call constants at runtime", () => {
  assert.equal(CALL_SCOPE_DIRECT, 1);
  assert.equal(CALL_SCOPE_GROUP, 2);
  assert.equal(CALL_MEDIA_TYPE_AUDIO, 1);
  assert.equal(CALL_MEDIA_TYPE_VIDEO, 2);
  assert.equal(CALL_STATUS_INITIATED, 1);
  assert.equal(CALL_STATUS_RINGING, 2);
  assert.equal(CALL_STATUS_ONGOING, 3);
  assert.equal(CALL_STATUS_ENDED, 4);
});
