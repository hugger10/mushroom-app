/**
 * Attachment URL resolver — 在所有"消息→客户端"出口集中重新签发 MinIO 预签名 URL。
 *
 * 背景：`attachments` bucket 已切为私有，`getFileUrl` 返回的预签名 URL 默认 15 分钟过期；
 * 但客户端会把消息（含 `content.url` / `content.thumb_url` / `content.preview_url`）写入
 * 本地缓存（IndexedDB / SQLite），如果直接持久化短期 URL，老消息很快就 403。
 *
 * 解决方案 A：服务端**始终**在消息出站时基于 `attachment_uploads.object_name` /
 * `thumb_object_key` / `preview_object_key` 即时签发新 URL，不依赖 `attachment_uploads.file_url`。
 * 客户端在加载缓存的旧消息时，如遇 403 可调用 `POST /file/attachment/refresh-urls`
 * 单独刷新对应 upload_id 的 URL。
 *
 * 性能：`presignedGetObject` 是纯 HMAC-SHA256，不调 MinIO，约 10–50µs；50 条消息≤200 次签名
 * 在毫秒量级，相对 DB 查询可忽略。同一响应内通过 `Map<object_name, url>` 缓存避重复签名。
 */

import {
  isFileMessageContent,
  type ChatMessage,
  type MessageFileContent,
  type RemoteMessage
} from "@mushroom/shared";
import AttachmentRepository from "../repository/attachment_repository";
import type { AttachmentUploadRecord } from "../repository/models";
import { MinioService } from "../storage/minio";
import { logger } from "../utils/logger";

const ATTACHMENTS_BUCKET = "attachments";

let cachedMinio: MinioService | null = null;
function getMinio(): MinioService {
  if (!cachedMinio) cachedMinio = new MinioService();
  return cachedMinio;
}

export type ResolvedAttachmentUrls = {
  upload_id: string;
  url?: string;
  thumb_url?: string;
  preview_url?: string;
  thumb_status: "none" | "pending" | "ready" | "failed";
  width?: number;
  height?: number;
  duration_ms?: number;
  size?: number;
  mime_type?: string;
  name?: string;
};

type MessageLike = ChatMessage | RemoteMessage;

function extractUploadIds(messages: MessageLike[]): string[] {
  const ids = new Set<string>();
  for (const message of messages) {
    const content = message.content as Record<string, unknown> | undefined;
    if (!content || !isFileMessageContent(content)) continue;
    const uploadId =
      typeof content.upload_id === "string" ? content.upload_id.trim() : "";
    if (uploadId) ids.add(uploadId);
    const thumbnailUploadId =
      typeof content.thumbnail_upload_id === "string"
        ? content.thumbnail_upload_id.trim()
        : "";
    if (thumbnailUploadId) ids.add(thumbnailUploadId);
  }
  return Array.from(ids);
}

/** Sign a single object key with a per-response cache to avoid duplicate HMACs. */
async function signWithCache(
  cache: Map<string, string>,
  objectName: string | null | undefined
): Promise<string | undefined> {
  if (!objectName) return undefined;
  const cached = cache.get(objectName);
  if (cached) return cached;
  try {
    const url = await getMinio().getFileUrl(ATTACHMENTS_BUCKET, objectName);
    cache.set(objectName, url);
    return url;
  } catch (err) {
    logger.warn(
      { err, objectName },
      "attachment-url-resolver: failed to sign object url"
    );
    return undefined;
  }
}

/** Resolve URLs for a list of upload ids; returns a map keyed by upload_id. */
export async function resolveAttachmentUrls(
  uploadIds: string[]
): Promise<Map<string, ResolvedAttachmentUrls>> {
  const map = new Map<string, ResolvedAttachmentUrls>();
  if (uploadIds.length === 0) return map;

  const records = await AttachmentRepository.findManyByIds(uploadIds);
  const signCache = new Map<string, string>();
  for (const record of records) {
    const url = await signWithCache(signCache, record.object_name);
    const thumbUrl = await signWithCache(signCache, record.thumb_object_key);
    const previewUrl = await signWithCache(
      signCache,
      record.preview_object_key
    );
    map.set(record.id, {
      upload_id: record.id,
      url,
      thumb_url: thumbUrl,
      preview_url: previewUrl,
      thumb_status: record.thumb_status,
      width: record.width ?? undefined,
      height: record.height ?? undefined,
      duration_ms: record.duration_ms ?? undefined,
      size: typeof record.size === "number" ? record.size : Number(record.size),
      mime_type: record.mime_type ?? undefined,
      name: record.original_name
    });
  }
  return map;
}

function applyResolutionToContent(
  content: MessageFileContent,
  uploads: Map<string, ResolvedAttachmentUrls>
): MessageFileContent {
  const uploadId = content.upload_id;
  const main = uploadId ? uploads.get(uploadId) : undefined;
  const thumbnailUploadId = content.thumbnail_upload_id;
  const thumb = thumbnailUploadId ? uploads.get(thumbnailUploadId) : undefined;

  if (!main && !thumb) return content;

  const next: MessageFileContent = { ...content };
  if (main) {
    if (main.url) next.url = main.url;
    if (main.thumb_status) next.thumb_status = main.thumb_status;
    // 服务端缩略图（图片消息自身的 thumb/preview）
    if (main.thumb_url) next.thumb_url = main.thumb_url;
    if (main.preview_url) next.preview_url = main.preview_url;
    if (typeof main.width === "number" && next.width === undefined) {
      next.width = main.width;
    }
    if (typeof main.height === "number" && next.height === undefined) {
      next.height = main.height;
    }
    if (
      typeof main.duration_ms === "number" &&
      next.duration_ms === undefined
    ) {
      next.duration_ms = main.duration_ms;
    }
  }
  if (thumb && thumb.url) {
    // 视频消息：客户端首帧缩略图作为独立附件，覆盖 thumb_url。
    next.thumb_url = thumb.url;
  }
  return next;
}

/**
 * 在出站前对一组消息批量注入新鲜的 attachment URL。直接修改入参对象的 `content` 字段。
 * 非附件消息原样返回。
 */
export async function enrichMessagesWithAttachmentUrls<T extends MessageLike>(
  messages: T[]
): Promise<T[]> {
  if (messages.length === 0) return messages;
  const uploadIds = extractUploadIds(messages);
  if (uploadIds.length === 0) return messages;
  const uploads = await resolveAttachmentUrls(uploadIds);
  for (const message of messages) {
    const content = message.content as Record<string, unknown> | undefined;
    if (!content || !isFileMessageContent(content)) continue;
    (message as unknown as { content: MessageFileContent }).content =
      applyResolutionToContent(content, uploads);
  }
  return messages;
}

/** 单条消息变体（recall payload / 单条 outbox）。 */
export async function enrichMessageWithAttachmentUrls<T extends MessageLike>(
  message: T
): Promise<T> {
  await enrichMessagesWithAttachmentUrls([message]);
  return message;
}

/**
 * 提取已加载 record 的 URL 解析（避免再次查询 DB）。供 saveMessage 内部复用。
 */
export async function resolveUrlsForRecords(
  records: Array<
    Pick<
      AttachmentUploadRecord,
      | "id"
      | "object_name"
      | "thumb_object_key"
      | "preview_object_key"
      | "thumb_status"
      | "width"
      | "height"
      | "duration_ms"
      | "size"
      | "mime_type"
      | "original_name"
    >
  >
): Promise<Map<string, ResolvedAttachmentUrls>> {
  const map = new Map<string, ResolvedAttachmentUrls>();
  const signCache = new Map<string, string>();
  for (const record of records) {
    const url = await signWithCache(signCache, record.object_name);
    const thumbUrl = await signWithCache(signCache, record.thumb_object_key);
    const previewUrl = await signWithCache(
      signCache,
      record.preview_object_key
    );
    map.set(record.id, {
      upload_id: record.id,
      url,
      thumb_url: thumbUrl,
      preview_url: previewUrl,
      thumb_status: record.thumb_status,
      width: record.width ?? undefined,
      height: record.height ?? undefined,
      duration_ms: record.duration_ms ?? undefined,
      size: typeof record.size === "number" ? record.size : Number(record.size),
      mime_type: record.mime_type ?? undefined,
      name: record.original_name
    });
  }
  return map;
}
