import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_IMAGE_COMPRESS,
  decideCompressStrategy,
  shouldCompressImage,
  rewriteHeicFilenameToJpg,
  pickVideoThumbnailTime
} from "@mushroom/shared";

test("DEFAULT_IMAGE_COMPRESS 保守档位", () => {
  assert.equal(DEFAULT_IMAGE_COMPRESS.maxEdge, 2560);
  assert.equal(DEFAULT_IMAGE_COMPRESS.quality, 0.85);
  assert.equal(DEFAULT_IMAGE_COMPRESS.jpegMime, "image/jpeg");
  assert.equal(DEFAULT_IMAGE_COMPRESS.stripExif, true);
});

test("decideCompressStrategy: HEIC/HEIF -> jpeg", () => {
  assert.equal(
    decideCompressStrategy({ mime: "image/heic", size: 999 }),
    "jpeg"
  );
  assert.equal(decideCompressStrategy({ mime: "image/heif", size: 0 }), "jpeg");
  assert.equal(decideCompressStrategy({ mime: "IMAGE/HEIC", size: 0 }), "jpeg");
});

test("decideCompressStrategy: PNG -> png", () => {
  assert.equal(decideCompressStrategy({ mime: "image/png", size: 0 }), "png");
  assert.equal(decideCompressStrategy({ mime: "image/x-png", size: 0 }), "png");
});

test("decideCompressStrategy: JPEG/WebP -> jpeg", () => {
  assert.equal(decideCompressStrategy({ mime: "image/jpeg", size: 0 }), "jpeg");
  assert.equal(decideCompressStrategy({ mime: "image/jpg", size: 0 }), "jpeg");
  assert.equal(decideCompressStrategy({ mime: "image/webp", size: 0 }), "jpeg");
});

test("decideCompressStrategy: GIF / 未知 -> skip", () => {
  assert.equal(decideCompressStrategy({ mime: "image/gif", size: 0 }), "skip");
  assert.equal(
    decideCompressStrategy({ mime: "application/octet-stream", size: 0 }),
    "skip"
  );
  assert.equal(decideCompressStrategy({ mime: "", size: 0 }), "skip");
});

test("shouldCompressImage 与 strategy 一致", () => {
  assert.equal(shouldCompressImage({ mime: "image/jpeg", size: 0 }), true);
  assert.equal(shouldCompressImage({ mime: "image/gif", size: 0 }), false);
});

test("rewriteHeicFilenameToJpg", () => {
  assert.equal(rewriteHeicFilenameToJpg("IMG_001.HEIC"), "IMG_001.jpg");
  assert.equal(rewriteHeicFilenameToJpg("foo.heif"), "foo.jpg");
  assert.equal(rewriteHeicFilenameToJpg("bar.jpg"), "bar.jpg");
  assert.equal(rewriteHeicFilenameToJpg("noext"), "noext");
});

test("pickVideoThumbnailTime", () => {
  assert.equal(pickVideoThumbnailTime(0), 0);
  assert.equal(pickVideoThumbnailTime(null), 0);
  assert.equal(pickVideoThumbnailTime(undefined), 0);
  assert.equal(pickVideoThumbnailTime(20), 1);
  assert.equal(pickVideoThumbnailTime(5), 0.5);
  assert.equal(pickVideoThumbnailTime(NaN), 0);
});
