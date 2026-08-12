import test from "node:test";
import assert from "node:assert/strict";
import { computeTotalUnread } from "../dist/index.mjs";

test("computeTotalUnread sums unread_count across conversations", () => {
  assert.equal(
    computeTotalUnread([
      { unread_count: 3 },
      { unread_count: 0 },
      { unread_count: 5 }
    ]),
    8
  );
});

test("computeTotalUnread excludes muted conversations by default", () => {
  assert.equal(
    computeTotalUnread([
      { unread_count: 3, is_muted: 0 },
      { unread_count: 10, is_muted: 1 },
      { unread_count: 2 }
    ]),
    5
  );
});

test("computeTotalUnread can include muted conversations when asked", () => {
  assert.equal(
    computeTotalUnread(
      [
        { unread_count: 3, is_muted: 0 },
        { unread_count: 10, is_muted: 1 }
      ],
      { excludeMuted: false }
    ),
    13
  );
});

test("computeTotalUnread ignores negative / non-numeric unread values", () => {
  assert.equal(
    computeTotalUnread([
      { unread_count: -4 },
      { unread_count: undefined },
      { unread_count: 6 }
    ]),
    6
  );
});

test("computeTotalUnread returns 0 for empty / nullish input", () => {
  assert.equal(computeTotalUnread([]), 0);
  assert.equal(computeTotalUnread(null), 0);
  assert.equal(computeTotalUnread(undefined), 0);
});
