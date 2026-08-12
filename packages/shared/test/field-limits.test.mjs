import test from "node:test";
import assert from "node:assert/strict";
import {
  CONTACT_REMARK_MAX_LENGTH,
  CONTACT_REMARK_NOTE_MAX_LENGTH,
  EMAIL_MAX_LENGTH,
  GROUP_ANNOUNCEMENT_MAX_LENGTH,
  GROUP_DESCRIPTION_MAX_LENGTH,
  GROUP_NAME_MAX_LENGTH,
  NICKNAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PHONE_MAX_LENGTH,
  SEARCH_KEYWORD_MAX_LENGTH,
  SIGNATURE_MAX_LENGTH,
  USERNAME_MAX_LENGTH
} from "../dist/index.mjs";

test("field limits are positive and within DB physical bounds", () => {
  const cases = [
    { value: USERNAME_MAX_LENGTH, db: 64, name: "username" },
    { value: NICKNAME_MAX_LENGTH, db: 255, name: "nickname" },
    { value: EMAIL_MAX_LENGTH, db: 255, name: "email" },
    { value: PHONE_MAX_LENGTH, db: 32, name: "phone" },
    { value: CONTACT_REMARK_MAX_LENGTH, db: 100, name: "remark" },
    { value: CONTACT_REMARK_NOTE_MAX_LENGTH, db: 500, name: "remark note" },
    { value: GROUP_NAME_MAX_LENGTH, db: 255, name: "group name" },
    { value: SEARCH_KEYWORD_MAX_LENGTH, db: 50, name: "search" }
  ];
  for (const { value, db, name } of cases) {
    assert.ok(Number.isInteger(value), `${name} must be an integer`);
    assert.ok(value > 0, `${name} must be positive`);
    assert.ok(value <= db, `${name} must not exceed DB physical limit`);
  }
});

test("display-oriented limits stay small", () => {
  assert.ok(GROUP_NAME_MAX_LENGTH <= 16, "group name must be small");
  assert.ok(NICKNAME_MAX_LENGTH <= 32, "nickname must be small");
  assert.ok(CONTACT_REMARK_MAX_LENGTH <= 32, "remark must be small");
  assert.ok(SIGNATURE_MAX_LENGTH <= 100, "signature must be small");
  assert.ok(GROUP_DESCRIPTION_MAX_LENGTH <= 100, "description must be small");
  assert.ok(GROUP_ANNOUNCEMENT_MAX_LENGTH <= 200, "announcement must be small");
});

test("password has a sane upper bound", () => {
  assert.ok(PASSWORD_MAX_LENGTH >= 64, "password must allow strong values");
  assert.ok(
    PASSWORD_MAX_LENGTH <= 72,
    "password must stay under bcrypt's 72-byte ceiling"
  );
});
