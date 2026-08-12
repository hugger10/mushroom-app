/**
 * 生成移动端聊天背景涂鸦 PNG（浅色 / 暗黑两份）
 *
 * 源资源：apps/mobile/src/assets/chat-doodle.svg（WhatsApp 风格涂鸦）
 * 产物 ：apps/mobile/src/assets/chat-doodle-light.png
 *         apps/mobile/src/assets/chat-doodle-dark.png
 *
 * 用法：
 *   node scripts/gen-mobile-chat-doodle.mjs
 *
 * 调整方法（直接修改本文件下方常量，再重新执行）：
 *   1. 想要"涂鸦更大、更稀疏"：增大 TILE_W / TILE_H（按比例同时增减）
 *      想要"涂鸦更小、更密集"：减小 TILE_W / TILE_H
 *      原始 SVG viewBox 是 374x666，建议保持 16:9 ~ 1:1.78 的同比缩放
 *
 *   2. 想要"涂鸦更明显（深）"：增大 LIGHT_OPACITY / DARK_OPACITY
 *      想要"涂鸦更淡（浅）"  ：减小 LIGHT_OPACITY / DARK_OPACITY
 *      数值范围 0~1，推荐 0.08~0.30 之间
 *
 *   3. 想要"换涂鸦颜色"：改 LIGHT_STROKE / DARK_STROKE（HEX 颜色）
 *      LIGHT 用在浅色主题底色 #E5DDD5 之上，常用深绿/深灰
 *      DARK  用在暗黑主题底色 #0B141A 之上，常用淡灰白
 *
 *   4. 想要"更清晰的细节"：增大 DENSITY（SVG 渲染分辨率），但产物体积也会变大
 *
 * 说明：
 *   - stroke-opacity 会被 sharp 烘焙进 PNG 的 alpha 通道，PNG 一旦生成
 *     就无法再通过 RN 端 opacity 把"不透明度"补回来，所以调淡/深必须重跑本脚本。
 *   - PNG 文件名不变，metro 缓存可能不感知更新；如不刷新请执行：
 *     pnpm --filter @mushroom/mobile start --reset-cache
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

// ────────────────────────────────────────────────────────────────────
// 可调参数
// ────────────────────────────────────────────────────────────────────

/** 单块涂鸦平铺尺寸（像素）。越大单个图案越大、整体越稀疏。 */
const TILE_W = 920;
const TILE_H = 1640;

/** 浅色主题描边颜色（HEX）与不透明度（0~1） */
const LIGHT_STROKE = "#0B5D4A";
const LIGHT_OPACITY = 0.18;

/** 暗黑主题描边颜色（HEX）与不透明度（0~1） */
const DARK_STROKE = "#E9EDEF";
const DARK_OPACITY = 0.12;

/** SVG 渲染分辨率（DPI）。越大越清晰但体积越大。 */
const DENSITY = 220;

// ────────────────────────────────────────────────────────────────────
// 以下一般无需修改
// ────────────────────────────────────────────────────────────────────

const ROOT = path.resolve(new URL(".", import.meta.url).pathname, "..");
const SRC = path.join(ROOT, "apps/mobile/src/assets/chat-doodle.svg");
const OUT_LIGHT = path.join(
  ROOT,
  "apps/mobile/src/assets/chat-doodle-light.png"
);
const OUT_DARK = path.join(ROOT, "apps/mobile/src/assets/chat-doodle-dark.png");

const svgRaw = readFileSync(SRC, "utf8");

function bake(stroke, opacity) {
  return svgRaw.replace(
    /stroke="currentColor"/g,
    `stroke="${stroke}" stroke-opacity="${opacity}"`
  );
}

async function render(svgString, outPath) {
  const buf = Buffer.from(svgString, "utf8");
  await sharp(buf, { density: DENSITY })
    .resize(TILE_W, TILE_H)
    .png({ compressionLevel: 9 })
    .toFile(outPath);
  console.log("wrote", path.relative(ROOT, outPath));
}

await render(bake(LIGHT_STROKE, LIGHT_OPACITY), OUT_LIGHT);
await render(bake(DARK_STROKE, DARK_OPACITY), OUT_DARK);
