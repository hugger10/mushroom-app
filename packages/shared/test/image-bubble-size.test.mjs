import { test } from "node:test";
import assert from "node:assert/strict";
import { computeImageBubbleSize, getMediaAspectRatio } from "@mushroom/shared";

test("computeImageBubbleSize: 横图按比例缩放到 maxWidth", () => {
  const r = computeImageBubbleSize({ width: 1920, height: 1080 });
  assert.equal(r.width, 280);
  assert.equal(r.height, Math.round(280 / (1920 / 1080)));
  assert.equal(r.hasIntrinsic, true);
  assert.equal(r.useExternalFooter, false);
});

test("computeImageBubbleSize: 竖图按 maxHeight 收高", () => {
  const r = computeImageBubbleSize({ width: 1080, height: 1920 });
  assert.equal(r.height, 320);
  assert.equal(r.width, Math.round(320 * (1080 / 1920)));
  assert.ok(r.width <= 280);
  assert.equal(r.useExternalFooter, false);
});

test("computeImageBubbleSize: 极小图直接按真实像素", () => {
  const r = computeImageBubbleSize({ width: 64, height: 64 });
  assert.equal(r.width, 80); // 放大到 minWidth
  assert.equal(r.height, 80);
  assert.equal(r.useExternalFooter, true); // 80 < 120 → 外部 footer
});

test("computeImageBubbleSize: 超窄竖条触发 external footer", () => {
  const r = computeImageBubbleSize({ width: 200, height: 2000 });
  assert.ok(r.height <= 320);
  assert.ok(r.width < 120);
  assert.equal(r.useExternalFooter, true);
});

test("computeImageBubbleSize: 缺失尺寸时用 4:3 fallback", () => {
  const r = computeImageBubbleSize({ width: undefined, height: null });
  assert.equal(r.hasIntrinsic, false);
  assert.equal(r.width, 280);
  assert.equal(r.height, Math.round(280 / (4 / 3)));
  assert.equal(r.useExternalFooter, false);
});

test("computeImageBubbleSize: 0 或负数尺寸回退到 fallback", () => {
  const r = computeImageBubbleSize({ width: 0, height: -100 });
  assert.equal(r.hasIntrinsic, false);
  assert.equal(r.width, 280);
});

test("computeImageBubbleSize: 正方形大图", () => {
  const r = computeImageBubbleSize({ width: 1000, height: 1000 });
  assert.equal(r.width, 280);
  assert.equal(r.height, 280);
  assert.equal(r.useExternalFooter, false);
});

test("computeImageBubbleSize: 自定义 options 生效", () => {
  const r = computeImageBubbleSize(
    { width: 1920, height: 1080 },
    { maxWidth: 220, maxHeight: 160 }
  );
  assert.ok(r.width <= 220);
  assert.ok(r.height <= 160);
});

test("getMediaAspectRatio: 兼容旧 API", () => {
  assert.equal(
    getMediaAspectRatio({ width: 1920, height: 1080 }),
    "1.7777777777777777"
  );
  assert.equal(getMediaAspectRatio({ width: 100, height: 1000 }), "0.5"); // clamp
  assert.equal(getMediaAspectRatio(null), "4 / 3");
  assert.equal(getMediaAspectRatio({ width: 0, height: 100 }), "4 / 3");
});
