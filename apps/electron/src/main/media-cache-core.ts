import path from "node:path";
import { getAccountMediaRoot } from "./runtime-paths";

export const mediaCacheProtocol = "mushroom-media-cache";

export const mediaCacheCategories = [
  "images",
  "files",
  "voice",
  "video",
  "thumbs"
] as const;

export type MediaCacheCategory = (typeof mediaCacheCategories)[number];

const categorySet = new Set<string>(mediaCacheCategories);

const mimeExtensionMap: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/bmp": "bmp",
  "image/svg+xml": "svg",
  "audio/mp4": "m4a",
  "audio/m4a": "m4a",
  "audio/aac": "aac",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "application/pdf": "pdf",
  "application/zip": "zip",
  "text/plain": "txt"
};

const imageExtensions = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "bmp",
  "svg"
]);
const audioExtensions = new Set(["m4a", "aac", "ogg", "mp3", "wav", "flac"]);
const videoExtensions = new Set(["mp4", "mov", "webm", "m4v", "avi", "mkv"]);

export function isMediaCacheCategory(
  value: string
): value is MediaCacheCategory {
  return categorySet.has(value);
}

export function assertMediaCacheCategory(value: string): MediaCacheCategory {
  if (!isMediaCacheCategory(value)) {
    throw new Error(`Unsupported media cache category: ${value}`);
  }
  return value;
}

export function getMonthKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}_${month}`;
}

export function getMediaCacheRoot(uid: number | string) {
  return getAccountMediaRoot(uid);
}

export function buildLocalMediaCacheUrl(localPath: string) {
  return `${mediaCacheProtocol}://local/${encodeURIComponent(path.resolve(localPath))}`;
}

export function parseLocalMediaCacheUrl(localUrl: string) {
  const parsed = new URL(localUrl);
  if (parsed.protocol !== `${mediaCacheProtocol}:`) {
    throw new Error(`Unsupported media cache protocol: ${parsed.protocol}`);
  }
  if (parsed.hostname !== "local") {
    throw new Error(`Unsupported media cache host: ${parsed.hostname}`);
  }

  const encodedPath = parsed.pathname.replace(/^\//, "");
  if (!encodedPath) {
    throw new Error("Missing media cache path");
  }
  return decodeURIComponent(encodedPath);
}

export function getCategoryDir(input: {
  uid: number | string;
  monthKey: string;
  category: MediaCacheCategory;
}) {
  return path.join(
    getMediaCacheRoot(input.uid),
    input.monthKey,
    input.category
  );
}

export function isPathInside(parentDir: string, targetPath: string) {
  const parent = path.resolve(parentDir);
  const target = path.resolve(targetPath);
  const relative = path.relative(parent, target);
  return (
    Boolean(relative) &&
    !relative.startsWith("..") &&
    !path.isAbsolute(relative)
  );
}

function extensionFromName(value?: string | null) {
  if (!value) {
    return "";
  }

  const pathname = safeUrlPathname(value) ?? value;
  const extension = path.extname(pathname).replace(/^\./, "").toLowerCase();
  if (!/^[a-z0-9]{1,12}$/.test(extension)) {
    return "";
  }
  return extension;
}

function safeUrlPathname(value: string) {
  try {
    return new URL(value).pathname;
  } catch {
    return null;
  }
}

export function inferExtension(input: {
  mimeType?: string | null;
  fileName?: string | null;
  remoteUrl?: string | null;
  fallback?: string;
}) {
  const mimeType = input.mimeType?.trim().toLowerCase();
  if (mimeType && mimeExtensionMap[mimeType]) {
    return mimeExtensionMap[mimeType];
  }

  return (
    extensionFromName(input.fileName) ||
    extensionFromName(input.remoteUrl) ||
    input.fallback ||
    "bin"
  );
}

export function resolveMediaCacheCategory(input: {
  mimeType?: string | null;
  fileName?: string | null;
  explicitCategory?: MediaCacheCategory | null;
}) {
  if (input.explicitCategory) {
    return input.explicitCategory;
  }

  const mimeType = input.mimeType?.trim().toLowerCase();
  if (mimeType?.startsWith("image/")) {
    return "images";
  }
  if (mimeType?.startsWith("audio/")) {
    return "voice";
  }
  if (mimeType?.startsWith("video/")) {
    return "video";
  }

  const extension = extensionFromName(input.fileName);
  if (imageExtensions.has(extension)) {
    return "images";
  }
  if (audioExtensions.has(extension)) {
    return "voice";
  }
  if (videoExtensions.has(extension)) {
    return "video";
  }

  return "files";
}

function sanitizeFileSegment(
  value: string | number | null | undefined,
  fallback: string
) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return fallback;
  }
  return normalized.replace(/[^a-zA-Z0-9-_]+/g, "_").slice(0, 80) || fallback;
}

export function buildCacheFileName(input: {
  messageId?: string | number | null;
  uploadId?: string | number | null;
  hash16: string;
  extension: string;
}) {
  const messageId = sanitizeFileSegment(input.messageId, "message");
  const uploadId = sanitizeFileSegment(input.uploadId, "upload");
  const hash16 = sanitizeFileSegment(input.hash16, "hash").slice(0, 16);
  const extension = inferExtension({ fallback: input.extension });
  return `${messageId}-${uploadId}-${hash16}.${extension}`;
}

export function normalizeRemoteUrl(remoteUrl: string) {
  const normalized = remoteUrl.trim();
  if (!normalized) {
    throw new Error("Missing remote url");
  }

  const parsed = new URL(normalized);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Unsupported media cache url protocol: ${parsed.protocol}`);
  }
  return parsed.toString();
}

export function buildDownloadTaskKey(input: {
  uid: number | string;
  category: MediaCacheCategory;
  remoteUrl: string;
}) {
  return `${input.uid}::${input.category}::${normalizeRemoteUrl(input.remoteUrl)}`;
}
