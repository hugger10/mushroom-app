/**
 * Mobile 端视频首帧抽取（复用 react-native-create-thumbnail）。
 *
 * 与 message-actions 中已有逻辑合并：返回独立的、与 web 行为一致的契约结构。
 */
import { createThumbnail } from "react-native-create-thumbnail";
import RNFS from "react-native-fs";
import log from "../utils/log";

export interface MobileVideoThumbnailResult {
  uri: string;
  name: string;
  type: string;
  size: number;
  width?: number;
  height?: number;
}

export async function extractVideoThumbnail(
  videoUri: string
): Promise<MobileVideoThumbnailResult | null> {
  try {
    const thumb = await createThumbnail({
      url: videoUri,
      timeStamp: 1000,
      format: "jpeg"
    });
    if (!thumb?.path) return null;
    const size = await safeSize(thumb.path, thumb.size);
    return {
      uri: thumb.path,
      name: `thumb-${Date.now()}.jpg`,
      type: thumb.mime || "image/jpeg",
      size,
      width: thumb.width,
      height: thumb.height
    };
  } catch (err) {
    log.scope("mobile").warn("[videoThumbnail] failed:", err);
    return null;
  }
}

async function safeSize(uri: string, fallback?: number): Promise<number> {
  if (typeof fallback === "number" && fallback > 0) return fallback;
  try {
    const normalized = uri.startsWith("file://")
      ? uri.slice("file://".length)
      : uri;
    const stat = await RNFS.stat(normalized);
    return Number(stat.size) || 0;
  } catch {
    return 0;
  }
}
