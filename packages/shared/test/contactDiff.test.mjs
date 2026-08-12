import test from "node:test";
import assert from "node:assert/strict";
import { hasContactChanged } from "../dist/index.mjs";

function makeContact(overrides = {}) {
  return {
    user_id: 1,
    username: "alice",
    nickname: "Alice",
    remark_name: null,
    remark_note: null,
    source: null,
    status: "normal",
    avatar_url: undefined,
    gender: 0,
    signature: undefined,
    is_blocked: false,
    updated_at: "2026-05-22T01:00:00.000Z",
    ...overrides
  };
}

test("hasContactChanged returns false for identical contacts", () => {
  assert.equal(hasContactChanged(makeContact(), makeContact()), false);
});

test("hasContactChanged ignores updated_at-only differences", () => {
  assert.equal(
    hasContactChanged(
      makeContact({ updated_at: "2026-05-22T02:00:00.000Z" }),
      makeContact({ updated_at: "2026-05-22T01:00:00.000Z" })
    ),
    false
  );
});

test("hasContactChanged treats undefined and null as equivalent", () => {
  assert.equal(
    hasContactChanged(
      makeContact({ remark_name: undefined, signature: undefined }),
      makeContact({ remark_name: null, signature: null })
    ),
    false
  );
});

test("hasContactChanged detects remark_name change", () => {
  assert.equal(
    hasContactChanged(
      makeContact({ remark_name: "波黑9" }),
      makeContact({ remark_name: null })
    ),
    true
  );
});

test("hasContactChanged detects nickname change", () => {
  assert.equal(
    hasContactChanged(
      makeContact({ nickname: "Alice Smith" }),
      makeContact({ nickname: "Alice" })
    ),
    true
  );
});

test("hasContactChanged detects avatar_url change", () => {
  assert.equal(
    hasContactChanged(
      makeContact({ avatar_url: "https://example.com/a.png" }),
      makeContact({ avatar_url: undefined })
    ),
    true
  );
});

test("hasContactChanged detects is_blocked change", () => {
  assert.equal(
    hasContactChanged(
      makeContact({ is_blocked: true }),
      makeContact({ is_blocked: false })
    ),
    true
  );
});

test("hasContactChanged detects status change", () => {
  assert.equal(
    hasContactChanged(
      makeContact({ status: "deleted" }),
      makeContact({ status: "normal" })
    ),
    true
  );
});

test("hasContactChanged detects gender change", () => {
  assert.equal(
    hasContactChanged(makeContact({ gender: 1 }), makeContact({ gender: 0 })),
    true
  );
});

test("hasContactChanged detects signature change", () => {
  assert.equal(
    hasContactChanged(
      makeContact({ signature: "Hello" }),
      makeContact({ signature: undefined })
    ),
    true
  );
});
