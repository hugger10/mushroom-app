import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  optionalNumberField,
  optionalQueryNumber,
  optionalStringField,
  requireNumberField
} = require("../dist/server/src/handler/request_parser.js");

test("optionalStringField trims non-empty string values", () => {
  assert.equal(
    optionalStringField({ nickname: "  Alice  " }, "nickname"),
    "Alice"
  );
});

test("optionalStringField returns undefined for blank values", () => {
  assert.equal(optionalStringField({ nickname: "   " }, "nickname"), undefined);
  assert.equal(optionalStringField({}, "nickname"), undefined);
});

test("requireNumberField rejects blank, null, and non-finite values", () => {
  assert.throws(
    () => requireNumberField({ user_id: null }, "user_id"),
    /user_id is required/
  );
  assert.throws(
    () => requireNumberField({ user_id: "" }, "user_id"),
    /user_id is required/
  );
  assert.throws(
    () => requireNumberField({ user_id: "Infinity" }, "user_id"),
    /user_id is required/
  );
});

test("optional numeric parsers reject non-finite values", () => {
  assert.throws(
    () => optionalNumberField({ role: Infinity }, "role"),
    /role must be a valid number/
  );
  assert.throws(
    () => optionalQueryNumber({ query: { limit: "Infinity" } }, "limit"),
    /limit must be a valid number/
  );
});
