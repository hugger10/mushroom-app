/**
 * Web/Electron 端图片压缩实现。
 *
 * 策略：
 * - HEIC/HEIF：动态加载 heic2any，转为 JPEG Blob，再走通用路径
 * - PNG：保留 image/png（含透明保护），仅 resize；canvas 重编码自然剥离 EXIF
 * - JPEG/WebP：canvas 重编码为 JPEG（resize + 剥 EXIF）
 * - GIF / 未知：跳过
 *
 * 默认档位见 packages/shared/src/media/imageCompress.ts。
 */
import {
  DEFAULT_IMAGE_COMPRESS,
  decideCompressStrategy,
  rewriteHeicFilenameToJpg,
  type CompressedImageMeta,
  type ImageCompressOptions
} from "@mushroom/shared";
import log from "@/utils/log";

export interface CompressImageResult {
  file: File;
  meta: CompressedImageMeta;
}

/**
 * 入口函数。失败时回退原文件并记录日志（不抛错），保证发送链路不被压缩问题阻断。
 */
export async function compressImageForUpload(
  input: File,
  options: ImageCompressOptions = DEFAULT_IMAGE_COMPRESS
): Promise<CompressImageResult> {
  const strategy = decideCompressStrategy({
    mime: input.type,
    size: input.size
  });
  if (strategy === "skip") {
    return { file: input, meta: makeSkipMeta(input) };
  }

  try {
    let workingBlob: Blob = input;
    let workingName = input.name;

    // HEIC -> JPEG 预处理
    if (isHeic(input.type, input.name)) {
      const converted = await convertHeicToJpeg(input, options.quality);
      if (!converted) {
        log.warn("[compressImage] HEIC convert failed, fallback to original");
        return { file: input, meta: makeSkipMeta(input) };
      }
      workingBlob = converted;
      workingName = rewriteHeicFilenameToJpg(input.name);
    }

    const bitmap = await loadBitmap(workingBlob);
    const originalWidth = bitmap.width;
    const originalHeight = bitmap.height;
    const { width, height } = fitInside(
      originalWidth,
      originalHeight,
      options.maxEdge
    );

    // 输出 MIME：PNG 分支保留 PNG，其他统一 JPEG
    const outMime = strategy === "png" ? "image/png" : options.jpegMime;
    const blob = await renderToBlob(
      bitmap,
      width,
      height,
      outMime,
      options.quality
    );
    bitmap.close?.();

    if (!blob) {
      log.warn("[compressImage] toBlob returned null, fallback to original");
      return { file: input, meta: makeSkipMeta(input) };
    }

    // 极端情况：压缩后反而更大（小图常见）。
    // 仍然采用压缩后的，因为我们的目的不仅是省字节，还有剥 EXIF / 统一格式 / 兼容性。
    const outFile = new File(
      [blob],
      maybeAdjustExtension(workingName, outMime),
      { type: outMime, lastModified: Date.now() }
    );

    const meta: CompressedImageMeta = {
      width,
      height,
      originalWidth,
      originalHeight,
      originalSize: input.size,
      compressedSize: outFile.size,
      mimeType: outMime,
      didCompress: true
    };
    return { file: outFile, meta };
  } catch (err) {
    log.warn("[compressImage] failed, fallback to original:", err);
    return { file: input, meta: makeSkipMeta(input) };
  }
}

function makeSkipMeta(file: File): CompressedImageMeta {
  return {
    width: 0,
    height: 0,
    originalSize: file.size,
    compressedSize: file.size,
    mimeType: file.type,
    didCompress: false
  };
}

function isHeic(mime: string, name: string): boolean {
  const m = (mime || "").toLowerCase();
  if (
    m === "image/heic" ||
    m === "image/heif" ||
    m.includes("heic") ||
    m.includes("heif")
  ) {
    return true;
  }
  return /\.(heic|heif)$/i.test(name);
}

async function convertHeicToJpeg(
  file: File,
  quality: number
): Promise<Blob | null> {
  try {
    // 动态加载，避免非 HEIC 场景把 ~600KB 打进首屏
    const mod: any = await import(/* @vite-ignore */ "heic2any");
    const heic2any = mod.default ?? mod;
    const result = await heic2any({
      blob: file,
      toType: "image/jpeg",
      quality
    });
    // heic2any 多图 HEIC 时返回数组
    const blob: Blob = Array.isArray(result) ? result[0] : (result as Blob);
    return blob ?? null;
  } catch (err) {
    log.warn("[compressImage] heic2any failed:", err);
    return null;
  }
}

async function loadBitmap(blob: Blob): Promise<ImageBitmap> {
  // 让浏览器在解码阶段消化 EXIF Orientation
  if (typeof createImageBitmap !== "undefined") {
    try {
      return await createImageBitmap(blob, {
        imageOrientation: "from-image"
      } as any);
    } catch {
      // 部分浏览器对 options 不支持，回退
      return await createImageBitmap(blob);
    }
  }
  // 极端兜底：HTMLImageElement
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadHtmlImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.drawImage(img, 0, 0);
    return (await createImageBitmap(canvas)) as ImageBitmap;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadHtmlImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = url;
  });
}

function fitInside(w: number, h: number, maxEdge: number) {
  const longest = Math.max(w, h);
  if (longest <= maxEdge) {
    return { width: w, height: h };
  }
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale))
  };
}

async function renderToBlob(
  bitmap: ImageBitmap,
  width: number,
  height: number,
  mime: string,
  quality: number
): Promise<Blob | null> {
  if (typeof OffscreenCanvas !== "undefined") {
    try {
      const oc = new OffscreenCanvas(width, height);
      const ctx = oc.getContext("2d");
      if (!ctx) throw new Error("no 2d context (offscreen)");
      ctx.drawImage(bitmap, 0, 0, width, height);
      const blob = await oc.convertToBlob({ type: mime, quality });
      return blob ?? null;
    } catch (err) {
      log.warn(
        "[compressImage] OffscreenCanvas failed, fallback to HTMLCanvas:",
        err
      );
    }
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0, width, height);
  return new Promise<Blob | null>(resolve => {
    canvas.toBlob(b => resolve(b), mime, quality);
  });
}

function maybeAdjustExtension(name: string, outMime: string): string {
  if (outMime === "image/jpeg") {
    if (/\.(jpg|jpeg)$/i.test(name)) return name;
    return name.replace(/\.[^.]+$/, "") + ".jpg";
  }
  if (outMime === "image/png") {
    if (/\.png$/i.test(name)) return name;
    return name.replace(/\.[^.]+$/, "") + ".png";
  }
  return name;
}
