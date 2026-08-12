import type { AuthSessionStore } from "@mushroom/app-core";
import {
  ApiError,
  bytesToMB,
  detectAttachmentCategory,
  ChunkedUploader,
  type AttachmentCategory,
  type UploadResult
} from "@mushroom/shared";
import i18next from "i18next";
import * as RNFS from "react-native-fs";
import { createMobileServerApi } from "./factory";
import { ensureMobileLimits } from "./limits";
import type { MobileAttachmentAsset } from "./types";
import { createRNAdapter, normalizeLocalPath } from "./upload-adapter";
import { i18n } from "../../i18n";

/**
 * 通过 ChunkedUploader 走 MinIO 分片直传协议上传消息附件。
 * - 通过 `/api/config/limits` 拉取分级限额（带缓存）。
 * - 单分片 / 多分片由服务端 `initiateAttachmentUpload` 返回的 `mode` 决定。
 * - 失败时 ChunkedUploader 会调用 `abortAttachmentUpload` 做 best-effort 清理。
 *
 * 返回结构沿用历史调用方（`uploaded.upload_id` / `uploaded.url` /
 * `uploaded.size` / `uploaded.mime_type` / `uploaded.originalname`）所以
 * 这里把 `UploadResult` 的字段做了浅层转换。
 */
export async function uploadMobileAttachment(options: {
  baseURL: string;
  authStore: AuthSessionStore;
  file: MobileAttachmentAsset;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}): Promise<{
  upload_id: string;
  url: string;
  size: number;
  mime_type?: string;
  originalname: string;
  width?: number;
  height?: number;
  duration_ms?: number;
  thumb_status?: UploadResult["thumbStatus"];
}> {
  const api = createMobileServerApi({
    baseURL: options.baseURL,
    authStore: options.authStore
  });
  const limits = await ensureMobileLimits(api);
  const category: AttachmentCategory =
    options.file.category ??
    detectAttachmentCategory({
      mimeType: options.file.type,
      name: options.file.name
    });
  const maxBytes = limits.attachments[category];
  const size = Number(options.file.size || 0);
  if (Number.isFinite(size) && size > 0 && size > maxBytes) {
    throw new ApiError(
      i18next.t("chat.attachmentSizeExceeded", {
        label: i18next.t(`chat.attachmentCategory.${category}`),
        size: bytesToMB(maxBytes)
      })
    );
  }

  // 若 size 未知则尝试通过 RNFS.stat 补全；分片上传协议强依赖准确的总字节数。
  let actualSize = size;
  if (!Number.isFinite(actualSize) || actualSize <= 0) {
    try {
      const stat = await RNFS.stat(normalizeLocalPath(options.file.uri));
      actualSize = Number(stat.size || 0);
    } catch (statError) {
      throw new ApiError(
        statError instanceof Error
          ? i18n.t("api.readFileSizeFailedDetail", {
              message: statError.message
            })
          : i18n.t("api.readFileSizeFailed")
      );
    }
  }
  if (actualSize > maxBytes) {
    throw new ApiError(
      i18next.t("chat.attachmentSizeExceeded", {
        label: i18next.t(`chat.attachmentCategory.${category}`),
        size: bytesToMB(maxBytes)
      })
    );
  }

  const uploader = new ChunkedUploader({
    api,
    adapter: createRNAdapter(options.file),
    concurrency: limits.upload.concurrency,
    maxRetries: limits.upload.maxRetries,
    multipartThreshold: limits.upload.multipartThreshold
  });

  const result = await uploader.upload({
    source: {
      filename: options.file.name,
      size: actualSize,
      mimeType: options.file.type,
      category,
      width: options.file.width,
      height: options.file.height,
      durationMs: options.file.durationMs
    },
    signal: options.signal,
    onProgress: progress =>
      options.onProgress?.(Math.round(progress.percent * 100))
  });
  options.onProgress?.(100);

  return {
    upload_id: result.uploadId,
    url: result.url,
    size: result.size,
    mime_type: result.mimeType,
    originalname: options.file.name,
    width: result.width,
    height: result.height,
    duration_ms: result.durationMs,
    thumb_status: result.thumbStatus
  };
}
