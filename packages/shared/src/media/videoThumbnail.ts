/**
 * 视频首帧抽取的共享契约。各端实现：
 * - apps/web/src/media/extractVideoThumbnail.ts （<video> + canvas.toBlob）
 * - apps/mobile/src/media/extractVideoThumbnail.ts （react-native-create-thumbnail）
 */

export interface VideoThumbnailOptions {
  /** 抽取的时间点（秒），通常 min(1, duration*0.1) */
  timeSeconds?: number;
  /** 输出 JPEG 质量 */
  quality?: number;
}

export const DEFAULT_VIDEO_THUMBNAIL_OPTIONS: Required<VideoThumbnailOptions> =
  {
    timeSeconds: 1,
    quality: 0.8
  };

export interface VideoThumbnailMeta {
  width: number;
  height: number;
  /** 输出 MIME，固定 image/jpeg */
  mimeType: "image/jpeg";
}

/** 计算建议的抽帧时间点（秒）。 */
export function pickVideoThumbnailTime(
  durationSeconds: number | null | undefined
): number {
  if (
    !durationSeconds ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0
  )
    return 0;
  return Math.min(1, Math.max(0, durationSeconds * 0.1));
}
