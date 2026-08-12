import test from "node:test";
import assert from "node:assert/strict";
import { getTextMessageText } from "../dist/index.mjs";

test("getTextMessageText: returns text for a plain text message", () => {
  assert.equal(
    getTextMessageText({ type: 1, text: "hello world" }),
    "hello world"
  );
});

test("getTextMessageText: supports multiline text", () => {
  assert.equal(
    getTextMessageText({ type: 1, text: "line1\nline2" }),
    "line1\nline2"
  );
});

test("getTextMessageText: returns null for blank/whitespace text", () => {
  assert.equal(getTextMessageText({ type: 1, text: "   " }), null);
  assert.equal(getTextMessageText({ type: 1, text: "" }), null);
});

test("getTextMessageText: returns null when text is not a string", () => {
  assert.equal(getTextMessageText({ type: 1, text: 123 }), null);
  assert.equal(getTextMessageText({ type: 1, text: ["a"] }), null);
});

test("getTextMessageText: returns null for file attachment content", () => {
  assert.equal(
    getTextMessageText({
      type: 2,
      name: "doc.pdf",
      url: "https://example.com/doc.pdf",
      size: 1024
    }),
    null
  );
});

test("getTextMessageText: returns null for system message content", () => {
  assert.equal(
    getTextMessageText({
      type: 0,
      kind: "group_name_updated",
      text: "renamed"
    }),
    null
  );
});

test("getTextMessageText: returns null for merged-forward content", () => {
  assert.equal(
    getTextMessageText({
      type: "merged_forward",
      title: "Forwarded",
      messages: []
    }),
    null
  );
});

test("getTextMessageText: returns null for empty / non-object content", () => {
  assert.equal(getTextMessageText(null), null);
  assert.equal(getTextMessageText(undefined), null);
  assert.equal(getTextMessageText("plain string"), null);
  assert.equal(getTextMessageText(42), null);
});
