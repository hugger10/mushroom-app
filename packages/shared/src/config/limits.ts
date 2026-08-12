/**
 * 客户端与服务端共享的消息 / 附件 / 上传分片相关限额。
 *
 * 真实数值由服务端通过 `GET /api/config/limits` 下发；这里的常量仅作为
 * 客户端在尚未拉取到配置时的兜底默认值，保持与服务端 .env 默认一致。
 */

export const DEFAULT_MAX_TEXT_LENGTH = 2000;

/** 单条文本消息允许的最大字符数（用户可输入字符，不含 JSON 包装）。 */
export const MAX_TEXT_LENGTH = DEFAULT_MAX_TEXT_LENGTH;

/** 用户头像最大字节数（保持现状 5MB）。 */
export const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024;

/**
 * 附件分级大小限额（字节）。值与服务端 .env 默认值保持一致。
 * 客户端启动后应调用 `getLimits()` 用服务端配置覆盖这些默认值。
 */
export interface AttachmentSizeLimits {
  /** 图片附件，默认 30MB */
  image: number;
  /** 视频附件，默认 300MB */
  video: number;
  /** 普通音频附件（非语音消息），默认 100MB */
  audio: number;
  /** 语音消息（短录音），默认 50MB */
  voice: number;
  /** 其它文件，默认 200MB */
  file: number;
}

export const DEFAULT_ATTACHMENT_SIZE_LIMITS: AttachmentSizeLimits = {
  image: 30 * 1024 * 1024,
  video: 300 * 1024 * 1024,
  audio: 100 * 1024 * 1024,
  voice: 50 * 1024 * 1024,
  file: 200 * 1024 * 1024
};

/** 分片上传相关默认配置。 */
export interface ChunkUploadLimits {
  /** 单分片大小（字节），MinIO multipart 单分片最小 5MiB。 */
  chunkSize: number;
  /** 客户端并发上传分片数。 */
  concurrency: number;
  /** 单分片失败时的最大重试次数（指数退避）。 */
  maxRetries: number;
  /** Presigned URL 有效期（秒）。 */
  presignedExpiresSeconds: number;
  /** 触发 multipart 的最小文件大小（小于此值走 single PUT）。 */
  multipartThreshold: number;
}

export const DEFAULT_CHUNK_UPLOAD_LIMITS: ChunkUploadLimits = {
  chunkSize: 5 * 1024 * 1024,
  concurrency: 3,
  maxRetries: 3,
  presignedExpiresSeconds: 3600,
  multipartThreshold: 5 * 1024 * 1024
};

/** 服务端 `GET /api/config/limits` 响应体。 */
export interface LimitsConfig {
  maxTextLength: number;
  avatar: { maxBytes: number };
  attachments: AttachmentSizeLimits;
  upload: ChunkUploadLimits;
}

export const DEFAULT_LIMITS_CONFIG: LimitsConfig = {
  maxTextLength: DEFAULT_MAX_TEXT_LENGTH,
  avatar: { maxBytes: MAX_AVATAR_SIZE_BYTES },
  attachments: DEFAULT_ATTACHMENT_SIZE_LIMITS,
  upload: DEFAULT_CHUNK_UPLOAD_LIMITS
};

/** 附件分类，用于在 limits 中查找对应的大小上限。 */
export type AttachmentCategory = "image" | "video" | "audio" | "voice" | "file";

/**
 * 根据 MIME / 文件名 / 业务标志推断附件类别。
 * - `voice` 仅当显式带 `isVoice=true` 时返回（语音消息走独立限额）。
 */
export function detectAttachmentCategory(input: {
  mimeType?: string | null;
  name?: string | null;
  isVoice?: boolean;
}): AttachmentCategory {
  if (input.isVoice) return "voice";

  const mime = (input.mimeType ?? "").toLowerCase();
  const name = (input.name ?? "").toLowerCase();

  if (
    mime.startsWith("image/") ||
    /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name)
  ) {
    return "image";
  }
  if (
    mime.startsWith("video/") ||
    /\.(mp4|webm|mov|m4v|avi|mkv)$/i.test(name)
  ) {
    return "video";
  }
  if (
    mime.startsWith("audio/") ||
    /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(name)
  ) {
    return "audio";
  }
  return "file";
}

/** 返回字节数对应的 MB 整数（向上取整），用于错误提示展示。 */
export function bytesToMB(bytes: number): number {
  return Math.max(1, Math.round(bytes / 1024 / 1024));
}

/** 给定类别的人类可读名称（中文）。 */
export const ATTACHMENT_CATEGORY_LABEL: Record<AttachmentCategory, string> = {
  image: "图片",
  video: "视频",
  audio: "音频",
  voice: "语音",
  file: "文件"
};
