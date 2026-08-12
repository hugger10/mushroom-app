/**
 * Mobile 端图片压缩实现。
 *
 * 使用 react-native-compressor：
 * - HEIC/HEIF：库内自动解码 → 输出指定格式（这里强制 JPEG）
 * - PNG：保留 png 输出（PNG 透明保护，仅 resize）
 * - 其他：JPEG（resize + 重编码 = 剥 EXIF）
 *
 * 失败时返回原 asset，并打日志（不阻断发送）。
 */
import { Image } from "react-native-compressor";
import RNFS from "react-native-fs";
import {
  DEFAULT_IMAGE_COMPRESS,
  decideCompressStrategy,
  rewriteHeicFilenameToJpg,
  type CompressedImageMeta,
  type ImageCompressOptions
} from "@mushroom/shared";
import log from "../utils/log";

export interface MobileImageInput {
  uri: string;
  name: string;
  type: string;
  /** 字节数；picker 在某些情形下可能拿不到，传 undefined 即可。 */
  size?: number;
  width?: number;
  height?: number;
}

export interface MobileCompressImageResult {
  uri: string;
  name: string;
  type: string;
  /** 压缩成功为实际字节；未压缩时回传原始大小（可能为 0）。 */
  size: number;
  width?: number;
  height?: number;
  meta: CompressedImageMeta;
}

const COMPRESSOR_PROGRESS_OPTIONS: Record<string, unknown> = {
  /** 不显示原生进度条 */
  disablePngTransparency: false
};

export async function compressImageForUpload(
  input: MobileImageInput,
  options: ImageCompressOptions = DEFAULT_IMAGE_COMPRESS
): Promise<MobileCompressImageResult> {
  const strategy = decideCompressStrategy({
    mime: input.type,
    size: input.size ?? 0
  });

  if (strategy === "skip") {
    return passThrough(input);
  }

  try {
    const output: "jpg" | "png" = strategy === "png" ? "png" : "jpg";
    const outputMime = output === "png" ? "image/png" : "image/jpeg";
    const compressedUri = await Image.compress(input.uri, {
      compressionMethod: "manual",
      maxWidth: options.maxEdge,
      maxHeight: options.maxEdge,
      quality: options.quality,
      output,
      returnableOutputType: "uri",
      ...COMPRESSOR_PROGRESS_OPTIONS
    });

    if (!compressedUri || typeof compressedUri !== "string") {
      log.scope("mobile").warn("[compressImage] empty result, fallback");
      return passThrough(input);
    }

    const size = await safeFileSize(compressedUri, input.size ?? 0);
    const newName = renameForOutput(input.name, output);
    return {
      uri: compressedUri,
      name: newName,
      type: outputMime,
      size,
      // 透传 picker 给的原始像素，仅用于乐观气泡近似比例；
      // 最终宽高以服务端 sharp 再解析为准。
      width: input.width,
      height: input.height,
      meta: {
        width: input.width ?? 0,
        height: input.height ?? 0,
        originalWidth: input.width,
        originalHeight: input.height,
        originalSize: input.size ?? 0,
        compressedSize: size,
        mimeType: outputMime,
        didCompress: true
      }
    };
  } catch (err) {
    log.scope("mobile").warn("[compressImage] failed, fallback:", err);
    return passThrough(input);
  }
}

function passThrough(input: MobileImageInput): MobileCompressImageResult {
  return {
    uri: input.uri,
    name: input.name,
    type: input.type,
    size: input.size ?? 0,
    width: input.width,
    height: input.height,
    meta: {
      width: input.width ?? 0,
      height: input.height ?? 0,
      originalSize: input.size ?? 0,
      compressedSize: input.size ?? 0,
      mimeType: input.type,
      didCompress: false
    }
  };
}

async function safeFileSize(uri: string, fallback: number): Promise<number> {
  try {
    const normalized = uri.startsWith("file://")
      ? uri.slice("file://".length)
      : uri;
    const stat = await RNFS.stat(normalized);
    return Number(stat.size) || fallback;
  } catch {
    return fallback;
  }
}

function renameForOutput(name: string, output: "jpg" | "png"): string {
  if (output === "png") {
    return /\.png$/i.test(name) ? name : name.replace(/\.[^.]+$/, "") + ".png";
  }
  // jpg：把 HEIC/HEIF 后缀改成 jpg；其他保持 .jpg
  if (/\.(heic|heif)$/i.test(name)) {
    return rewriteHeicFilenameToJpg(name);
  }
  if (/\.(jpg|jpeg)$/i.test(name)) return name;
  return name.replace(/\.[^.]+$/, "") + ".jpg";
}
