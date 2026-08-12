/**
 * Web/Electron 端视频首帧抽取：<video> + canvas.toBlob。
 *
 * 失败时返回 null，调用方应静默忽略（不阻断发送，缩略图缺失服务端不会自动生成视频帧）。
 */
import {
  DEFAULT_VIDEO_THUMBNAIL_OPTIONS,
  pickVideoThumbnailTime,
  type VideoThumbnailMeta
} from "@mushroom/shared";
import log from "@/utils/log";

export interface VideoThumbnailResult {
  blob: Blob;
  file: File;
  meta: VideoThumbnailMeta;
  /** 视频时长（秒），可用于消息 content */
  durationSeconds?: number;
}

const THUMB_QUALITY = DEFAULT_VIDEO_THUMBNAIL_OPTIONS.quality;

export async function extractVideoThumbnail(
  file: File,
  thumbnailName?: string
): Promise<VideoThumbnailResult | null> {
  if (!file.type.startsWith("video/")) return null;
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "metadata";
  video.muted = true;
  video.playsInline = true;
  // 源是 blob: URL，同源 by definition，无需 crossOrigin。
  video.src = url;

  try {
    await waitFor(video, "loadedmetadata", 8000);
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const targetTime = pickVideoThumbnailTime(duration);
    if (targetTime > 0) {
      video.currentTime = targetTime;
      await waitFor(video, "seeked", 8000);
    } else {
      // 时长无效，尝试读首帧
      try {
        video.currentTime = 0;
        await waitFor(video, "seeked", 3000);
      } catch {
        /* 部分浏览器需要 play() 才能解码首帧；忽略错误 */
      }
    }

    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) {
      log.warn("[videoThumbnail] no videoWidth/Height");
      return null;
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, width, height);

    const blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(b => resolve(b), "image/jpeg", THUMB_QUALITY)
    );
    if (!blob) return null;

    const name = thumbnailName ?? makeThumbName(file.name);
    const thumbFile = new File([blob], name, {
      type: "image/jpeg",
      lastModified: Date.now()
    });
    return {
      blob,
      file: thumbFile,
      meta: { width, height, mimeType: "image/jpeg" },
      durationSeconds: duration > 0 ? duration : undefined
    };
  } catch (err) {
    log.warn("[videoThumbnail] extract failed:", err);
    return null;
  } finally {
    video.removeAttribute("src");
    try {
      video.load();
    } catch {
      /* noop */
    }
    URL.revokeObjectURL(url);
  }
}

function makeThumbName(videoName: string): string {
  const base = videoName.replace(/\.[^.]+$/, "");
  return `${base || "video"}.thumb.jpg`;
}

function waitFor(
  el: HTMLVideoElement,
  event: keyof HTMLMediaElementEventMap,
  timeoutMs: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const onErr = () => {
      cleanup();
      reject(new Error(`video event ${event} error`));
    };
    const onEv = () => {
      cleanup();
      resolve();
    };
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error(`video event ${event} timeout`));
    }, timeoutMs);
    const cleanup = () => {
      window.clearTimeout(timer);
      el.removeEventListener(event, onEv);
      el.removeEventListener("error", onErr);
    };
    el.addEventListener(event, onEv, { once: true });
    el.addEventListener("error", onErr, { once: true });
  });
}
