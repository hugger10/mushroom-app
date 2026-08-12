import test from "node:test";
import assert from "node:assert/strict";
import { collectAttachmentUploadIds } from "../dist/index.mjs";

function fileMsg(uploadId, extra = {}) {
  return {
    client_message_id: `c-${uploadId}`,
    content: {
      type: 2,
      file_type: "image",
      name: `${uploadId}.png`,
      url: `https://example.com/${uploadId}.png`,
      size: 1024,
      upload_id: uploadId,
      ...extra
    }
  };
}

test("collectAttachmentUploadIds: dedupes ids across messages", () => {
  const messages = [fileMsg("u1"), fileMsg("u2"), fileMsg("u1")];
  assert.deepEqual(collectAttachmentUploadIds(messages).sort(), ["u1", "u2"]);
});

test("collectAttachmentUploadIds: includes thumbnail_upload_id", () => {
  const messages = [fileMsg("u1", { thumbnail_upload_id: "t1" })];
  assert.deepEqual(collectAttachmentUploadIds(messages).sort(), ["t1", "u1"]);
});

test("collectAttachmentUploadIds: traverses merged-forward nested messages", () => {
  const merged = {
    client_message_id: "m-merged",
    content: {
      type: "merged_forward",
      title: "Forwarded",
      messages: [
        {
          content: {
            type: 2,
            file_type: "image",
            name: "n1.png",
            url: "https://x/n1.png",
            size: 10,
            upload_id: "nested-1"
          }
        },
        {
          content: {
            type: 2,
            file_type: "video",
            name: "n2.mp4",
            url: "https://x/n2.mp4",
            size: 20,
            upload_id: "nested-2"
          }
        }
      ]
    }
  };
  assert.deepEqual(collectAttachmentUploadIds([merged]).sort(), [
    "nested-1",
    "nested-2"
  ]);
});

test("collectAttachmentUploadIds: returns [] for null/empty/non-file content", () => {
  assert.deepEqual(collectAttachmentUploadIds(null), []);
  assert.deepEqual(collectAttachmentUploadIds([]), []);
  assert.deepEqual(
    collectAttachmentUploadIds([{ content: { type: 0, text: "hi" } }]),
    []
  );
});

test("collectAttachmentUploadIds: onAttachment callback maps id -> message", () => {
  const messages = [
    fileMsg("u1", { thumbnail_upload_id: "t1" }),
    fileMsg("u2")
  ];
  const map = {};
  collectAttachmentUploadIds(messages, (msg, id) => {
    map[id] = msg.client_message_id;
  });
  assert.deepEqual(map, {
    u1: "c-u1",
    t1: "c-u1",
    u2: "c-u2"
  });
});
