import test from "node:test";
import assert from "node:assert/strict";
import {
  pickAttachmentPreviewUrl,
  pickAttachmentFullUrl,
  pickAttachmentDisplayUri,
  pickVideoCoverUrl
} from "../dist/index.mjs";

test("pickAttachmentPreviewUrl: refreshed.preview_url wins over content.preview_url", () => {
  const got = pickAttachmentPreviewUrl(
    { thumb_url: "t", preview_url: "p" },
    { preview_url: "P", thumb_url: "T" }
  );
  assert.equal(got, "P");
});

test("pickAttachmentPreviewUrl: falls back to content.preview_url, then refreshed.thumb_url, then content.thumb_url", () => {
  assert.equal(
    pickAttachmentPreviewUrl({ thumb_url: "t", preview_url: "p" }, {}),
    "p"
  );
  assert.equal(
    pickAttachmentPreviewUrl({ thumb_url: "t" }, { thumb_url: "T" }),
    "T"
  );
  assert.equal(pickAttachmentPreviewUrl({ thumb_url: "t" }, null), "t");
  assert.equal(pickAttachmentPreviewUrl({}, null), null);
});

test("pickAttachmentPreviewUrl: does NOT fall back to url", () => {
  assert.equal(pickAttachmentPreviewUrl({ url: "u" }, null), null);
});

test("pickAttachmentFullUrl: refreshed.url wins", () => {
  assert.equal(pickAttachmentFullUrl({ url: "u" }, { url: "U" }), "U");
  assert.equal(pickAttachmentFullUrl({ url: "u" }, null), "u");
  assert.equal(pickAttachmentFullUrl({ url: "" }, null), null);
});

test("pickAttachmentDisplayUri: local cache wins over preview wins over full", () => {
  const content = { url: "u", thumb_url: "t", preview_url: "p" };
  assert.equal(
    pickAttachmentDisplayUri(content, null, "file:///cache.jpg"),
    "file:///cache.jpg"
  );
  assert.equal(pickAttachmentDisplayUri(content, null, null), "p");
  assert.equal(pickAttachmentDisplayUri({ url: "u" }, null, null), "u");
  assert.equal(pickAttachmentDisplayUri({ url: "" }, null, null), null);
});

test("pickAttachmentDisplayUri: empty local cache skipped", () => {
  assert.equal(pickAttachmentDisplayUri({ url: "u" }, null, ""), "u");
});

test("pickVideoCoverUrl: refreshed cover-url wins over content.thumb_url", () => {
  const got = pickVideoCoverUrl(
    { thumb_url: "t", preview_url: "p" },
    { url: "C" }
  );
  assert.equal(got, "C");
});

test("pickVideoCoverUrl: falls back to content.thumb_url, then preview_url", () => {
  assert.equal(
    pickVideoCoverUrl({ thumb_url: "t", preview_url: "p" }, null),
    "t"
  );
  assert.equal(
    pickVideoCoverUrl({ thumb_url: "", preview_url: "p" }, null),
    "p"
  );
  assert.equal(pickVideoCoverUrl({ thumb_url: "" }, { url: "" }), null);
  assert.equal(pickVideoCoverUrl({}, null), null);
});

test("pickVideoCoverUrl: does NOT fall back to main url", () => {
  assert.equal(pickVideoCoverUrl({ url: "u", thumb_url: "" }, null), null);
});
