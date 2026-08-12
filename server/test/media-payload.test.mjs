import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { mapMessages } = require("../dist/server/src/utils/mapper.js");
const { toRemoteMessage } = require("../dist/server/src/utils/dto.js");

test("toRemoteMessage preserves file payload objects", () => {
  const payload = toRemoteMessage({
    id: "msg-file-1",
    client_message_id: "client-file-1",
    conversation_id: "2001",
    sender_id: 7,
    type: 2,
    content: JSON.stringify({
      type: 2,
      name: "design-spec.pdf",
      url: "https://example.com/design-spec.pdf",
      size: 8192,
      mime_type: "application/pdf"
    }),
    created_at: "2026-03-28T08:00:00.000Z",
    updated_at: "2026-03-28T08:00:00.000Z",
    sequence: 18
  });

  assert.equal(payload.id, "msg-file-1");
  assert.equal(payload.type, 2);
  assert.deepEqual(payload.content, {
    type: 2,
    name: "design-spec.pdf",
    url: "https://example.com/design-spec.pdf",
    size: 8192,
    mime_type: "application/pdf"
  });
  assert.equal(payload.sequence, 18);
});

test("mapMessages preserves image payloads for websocket delivery", () => {
  const payload = mapMessages({
    id: "msg-image-1",
    client_message_id: "client-image-1",
    conversation_id: "2002",
    sender_id: 8,
    type: 2,
    content: JSON.stringify({
      type: 2,
      name: "preview.png",
      url: "https://example.com/preview.png",
      size: 2048,
      mime_type: "image/png"
    }),
    created_at: new Date("2026-03-28T08:01:00.000Z"),
    sequence: 19,
    client_conversation_id: "local-conv-2002"
  });

  assert.equal(payload.messageClassify, "chat");
  assert.equal(payload.type, 2);
  assert.deepEqual(payload.content, {
    type: 2,
    name: "preview.png",
    url: "https://example.com/preview.png",
    size: 2048,
    mime_type: "image/png"
  });
});

test("mapMessages builds quoted fallback text when reply payload has no text field", () => {
  const payload = mapMessages({
    id: "msg-file-quote-1",
    client_message_id: "client-file-quote-1",
    conversation_id: "2003",
    reply_to_message_id: "msg-file-root-1",
    reply_to_sender_id: 9,
    reply_to_sender_nickname: "Alex",
    reply_to_content: JSON.stringify({
      type: 2,
      name: "archive.zip",
      url: "https://example.com/archive.zip",
      size: 5120,
      mime_type: "application/zip"
    }),
    sender_id: 10,
    type: 1,
    content: JSON.stringify({ text: "received" }),
    created_at: new Date("2026-03-28T08:02:00.000Z"),
    sequence: 20,
    client_conversation_id: "local-conv-2003"
  });

  assert.deepEqual(payload.reply_to, {
    message_id: "msg-file-root-1",
    sender_id: 9,
    sender_nickname: "Alex",
    text: "[Quoted message]"
  });
});
