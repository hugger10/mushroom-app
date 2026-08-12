import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { pipeline } from "node:stream/promises";
import {
  BrowserWindow,
  dialog,
  ipcMain,
  net,
  protocol,
  session,
  shell
} from "electron";
import { request } from "undici";
import { v4 as uuidv4 } from "uuid";
import log from "../utils/log";
import { httpClient } from "../utils/httpClient";
import { getCurrentUserId, getDb } from "./database";
import {
  assertMediaCacheCategory,
  buildCacheFileName,
  buildDownloadTaskKey,
  buildLocalMediaCacheUrl,
  getCategoryDir,
  getMediaCacheRoot,
  getMonthKey,
  inferExtension,
  isPathInside,
  mediaCacheCategories,
  mediaCacheProtocol,
  normalizeRemoteUrl,
  parseLocalMediaCacheUrl,
  resolveMediaCacheCategory,
  type MediaCacheCategory
} from "./media-cache-core";

protocol.registerSchemesAsPrivileged([
  {
    scheme: mediaCacheProtocol,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true
    }
  }
]);

type MediaCacheStatus =
  | "downloading"
  | "ready"
  | "missing"
  | "failed"
  | "deleted";

type MediaCacheRecord = {
  id: number;
  user_id: number;
  message_id?: string | number | null;
  upload_id?: string | number | null;
  remote_url?: string | null;
  local_path: string;
  category: MediaCacheCategory;
  original_name?: string | null;
  mime_type?: string | null;
  size?: number | null;
  sha256?: string | null;
  month_key: string;
  status: MediaCacheStatus;
  created_at: string;
  updated_at: string;
  accessed_at?: string | null;
  client_conversation_id?: string | null;
};

type MediaCacheClientRecord = Omit<
  MediaCacheRecord,
  "local_path" | "user_id"
> & {
  userId: number;
  localPath: string;
  localUrl: string;
};

type ResolveMediaCacheInput = {
  remoteUrl: string;
  category?: MediaCacheCategory;
};

type DownloadMediaCacheInput = ResolveMediaCacheInput & {
  messageId?: string | number | null;
  uploadId?: string | number | null;
  originalName?: string | null;
  mimeType?: string | null;
  size?: number | null;
  createdAt?: string | null;
  clientConversationId?: string | null;
};

type RegisterLocalMediaCacheInput = Omit<
  DownloadMediaCacheInput,
  "remoteUrl"
> & {
  remoteUrl?: string | null;
  sourcePath: string;
};

type CleanupMediaCacheInput = {
  category?: MediaCacheCategory;
  categories?: MediaCacheCategory[];
  monthKey?: string;
  olderThanDays?: number;
};

type CleanupMediaCacheByConversationInput = {
  /** null/empty means "orphan" rows (client_conversation_id IS NULL). */
  clientConversationId: string | null;
  categories?: MediaCacheCategory[];
  olderThanDays?: number;
};

type MediaCacheCategoryStat = {
  category: MediaCacheCategory;
  count: number;
  size: number;
};

type MediaCacheConversationStat = {
  clientConversationId: string | null;
  totalBytes: number;
  fileCount: number;
  byCategory: Record<MediaCacheCategory, { count: number; size: number }>;
};

type ActiveDownload = {
  promise: Promise<MediaCacheClientRecord>;
  controller: AbortController;
};

const activeDownloads = new Map<string, ActiveDownload>();

/** Maximum number of retries for transient network errors (socket reset, timeout, etc.). */
const NETWORK_RETRY_MAX = 3;
/** Base delay in ms for exponential backoff (1 s → 2 s → 4 s). */
const NETWORK_RETRY_BASE_DELAY_MS = 1000;

/**
 * Detect transient network / socket errors that are safe to retry.
 * These are infrastructure-level failures (TCP reset, timeout, DNS) where the
 * server did NOT return an HTTP status code — the request simply never completed.
 */
function isTransientNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as NodeJS.ErrnoException).code ?? "";
  const retryableCodes = new Set([
    "UND_ERR_SOCKET", // undici: peer closed / reset
    "ECONNRESET", // OS-level connection reset
    "ECONNREFUSED", // server temporarily unavailable
    "ETIMEDOUT", // TCP connect/read timeout
    "EPIPE", // broken pipe
    "EAI_AGAIN", // DNS temporary failure
    "UND_ERR_CONNECT_TIMEOUT",
    "UND_ERR_BODY_TIMEOUT",
    "UND_ERR_HEADERS_TIMEOUT"
  ]);
  return retryableCodes.has(code);
}

function networkRetryDelay(attempt: number) {
  return NETWORK_RETRY_BASE_DELAY_MS * 2 ** attempt;
}

/**
 * 退出登录时调用：abort 所有 in-flight 下载，让 undici `request(..., { signal })`
 * 立即抛 AbortError，临时 .tmp 文件在 catch 分支被 unlink 清理，
 * 不会污染下一个账号的目录。最后清空索引。
 */
export function cancelAllMediaDownloads() {
  for (const { controller } of activeDownloads.values()) {
    try {
      controller.abort();
    } catch {
      // ignore: already aborted
    }
  }
  activeDownloads.clear();
}

function nowIso() {
  return new Date().toISOString();
}

async function ensureDir(dir: string) {
  await fsp.mkdir(dir, { recursive: true });
}

async function fileExists(filePath: string) {
  try {
    const stats = await fsp.stat(filePath);
    return stats.isFile();
  } catch {
    return false;
  }
}

async function fileSha256(filePath: string) {
  const hash = crypto.createHash("sha256");
  await pipeline(fs.createReadStream(filePath), hash);
  return hash.digest("hex");
}

function getCurrentUid(): number {
  const uid = getCurrentUserId();
  if (uid == null) {
    throw new Error("No active user; media cache is unavailable until login.");
  }
  return uid;
}

function getCacheRoot() {
  return getMediaCacheRoot(getCurrentUid());
}

function assertCachePath(filePath: string) {
  if (!isPathInside(getCacheRoot(), filePath)) {
    throw new Error("Media cache path is outside cache root");
  }
}

function toClientRecord(record: MediaCacheRecord): MediaCacheClientRecord {
  const { local_path, user_id, ...rest } = record;
  return {
    ...rest,
    userId: user_id,
    localPath: local_path,
    localUrl: buildLocalMediaCacheUrl(local_path)
  };
}

function normalizeRecord(row: Record<string, unknown>) {
  return {
    ...row,
    user_id: Number(row.user_id),
    category: assertMediaCacheCategory(String(row.category)),
    status: String(row.status) as MediaCacheStatus
  } as MediaCacheRecord;
}

function inferCategory(input: {
  category?: MediaCacheCategory | null;
  mimeType?: string | null;
  originalName?: string | null;
}) {
  return resolveMediaCacheCategory({
    mimeType: input.mimeType,
    fileName: input.originalName,
    explicitCategory: input.category ?? null
  });
}

function getRecordByRemote(input: {
  remoteUrl: string;
  category: MediaCacheCategory;
}) {
  const row = getDb()
    .prepare(
      `
      SELECT *
      FROM media_cache
      WHERE user_id = ?
        AND remote_url = ?
        AND category = ?
      LIMIT 1
      `
    )
    .get(
      getCurrentUid(),
      normalizeRemoteUrl(input.remoteUrl),
      input.category
    ) as Record<string, unknown> | undefined;

  return row ? normalizeRecord(row) : null;
}

function upsertReadyRecord(input: {
  messageId?: string | number | null;
  uploadId?: string | number | null;
  remoteUrl?: string | null;
  localPath: string;
  category: MediaCacheCategory;
  originalName?: string | null;
  mimeType?: string | null;
  size?: number | null;
  sha256?: string | null;
  monthKey: string;
  clientConversationId?: string | null;
}) {
  const timestamp = nowIso();
  const row = getDb()
    .prepare(
      `
      INSERT INTO media_cache (
        user_id,
        message_id,
        upload_id,
        remote_url,
        local_path,
        category,
        original_name,
        mime_type,
        size,
        sha256,
        month_key,
        status,
        created_at,
        updated_at,
        accessed_at,
        client_conversation_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready', ?, ?, ?, ?)
      ON CONFLICT(user_id, remote_url, category)
      WHERE remote_url IS NOT NULL
      DO UPDATE SET
        message_id = COALESCE(excluded.message_id, media_cache.message_id),
        upload_id = COALESCE(excluded.upload_id, media_cache.upload_id),
        local_path = excluded.local_path,
        original_name = COALESCE(excluded.original_name, media_cache.original_name),
        mime_type = COALESCE(excluded.mime_type, media_cache.mime_type),
        size = COALESCE(excluded.size, media_cache.size),
        sha256 = COALESCE(excluded.sha256, media_cache.sha256),
        month_key = excluded.month_key,
        status = 'ready',
        updated_at = excluded.updated_at,
        accessed_at = excluded.accessed_at,
        client_conversation_id = COALESCE(
          excluded.client_conversation_id,
          media_cache.client_conversation_id
        )
      RETURNING *
      `
    )
    .get(
      getCurrentUid(),
      input.messageId == null ? null : String(input.messageId),
      input.uploadId == null ? null : String(input.uploadId),
      input.remoteUrl ? normalizeRemoteUrl(input.remoteUrl) : null,
      input.localPath,
      input.category,
      input.originalName ?? null,
      input.mimeType ?? null,
      input.size ?? null,
      input.sha256 ?? null,
      input.monthKey,
      timestamp,
      timestamp,
      timestamp,
      input.clientConversationId ? String(input.clientConversationId) : null
    ) as Record<string, unknown>;

  return normalizeRecord(row);
}

function touchRecord(id: number) {
  getDb()
    .prepare(
      `
      UPDATE media_cache
      SET accessed_at = ?, updated_at = ?
      WHERE id = ?
      `
    )
    .run(nowIso(), nowIso(), id);
}

async function resolveMediaCache(input: ResolveMediaCacheInput) {
  const category = input.category
    ? assertMediaCacheCategory(input.category)
    : "files";
  const record = getRecordByRemote({
    remoteUrl: input.remoteUrl,
    category
  });

  if (!record || record.status !== "ready") {
    return { hit: false as const };
  }

  if (await fileExists(record.local_path)) {
    touchRecord(record.id);
    return { hit: true as const, record: toClientRecord(record) };
  }

  getDb()
    .prepare(
      `
      UPDATE media_cache
      SET status = 'missing', updated_at = ?
      WHERE id = ?
      `
    )
    .run(nowIso(), record.id);

  return { hit: false as const };
}

async function downloadMediaCache(input: DownloadMediaCacheInput) {
  const category = inferCategory({
    category: input.category,
    mimeType: input.mimeType,
    originalName: input.originalName
  });
  const remoteUrl = normalizeRemoteUrl(input.remoteUrl);
  const taskKey = buildDownloadTaskKey({
    uid: getCurrentUid(),
    category,
    remoteUrl
  });
  const existingTask = activeDownloads.get(taskKey);
  if (existingTask) {
    return existingTask.promise;
  }

  const controller = new AbortController();
  const task = downloadMediaCacheInternal({
    ...input,
    category,
    remoteUrl,
    signal: controller.signal
  });
  activeDownloads.set(taskKey, { promise: task, controller });
  try {
    return await task;
  } finally {
    activeDownloads.delete(taskKey);
  }
}

async function downloadMediaCacheInternal(
  input: DownloadMediaCacheInput & {
    category: MediaCacheCategory;
    remoteUrl: string;
    signal?: AbortSignal;
  },
  retried = false,
  networkRetry = 0
) {
  const resolved = await resolveMediaCache(input);
  if (resolved.hit) {
    return resolved.record;
  }

  const createdAt = input.createdAt ? new Date(input.createdAt) : new Date();
  const monthKey = Number.isNaN(createdAt.getTime())
    ? getMonthKey()
    : getMonthKey(createdAt);
  const categoryDir = getCategoryDir({
    uid: getCurrentUid(),
    monthKey,
    category: input.category
  });
  await ensureDir(categoryDir);
  const tmpPath = path.join(categoryDir, `.download-${uuidv4()}.tmp`);
  assertCachePath(tmpPath);

  try {
    const response = await request(input.remoteUrl, {
      method: "GET",
      signal: input.signal
    });
    if (response.statusCode < 200 || response.statusCode >= 300) {
      // 私有 bucket 的预签名 URL 过期后会返回 403（个别签名失配场景返回 404）。
      // 尝试调服务端 refresh-urls 拿到新签名 URL 后重试一次；仍失败则抛出。
      if (
        (response.statusCode === 403 || response.statusCode === 404) &&
        !retried &&
        input.uploadId
      ) {
        // 排空响应体并清理临时文件，避免句柄/磁盘泄漏
        try {
          response.body?.resume?.();
        } catch {
          /* noop */
        }
        await fsp.unlink(tmpPath).catch(() => undefined);
        const uploadIdStr = String(input.uploadId);
        try {
          const res = await httpClient.refreshAttachmentUrls({
            upload_ids: [uploadIdStr]
          });
          const item = res?.data?.items?.[uploadIdStr];
          const newUrl =
            input.category === "thumbs"
              ? (item?.thumb_url ?? item?.preview_url ?? item?.url)
              : item?.url;
          if (res?.code === 0 && newUrl && newUrl !== input.remoteUrl) {
            return downloadMediaCacheInternal(
              { ...input, remoteUrl: newUrl },
              true
            );
          }
        } catch (refreshError) {
          log.warn("refreshAttachmentUrls failed", refreshError);
        }
      }
      throw new Error(`Media download failed: ${response.statusCode}`);
    }

    await pipeline(response.body, fs.createWriteStream(tmpPath));
    const stats = await fsp.stat(tmpPath);
    const sha256 = await fileSha256(tmpPath);
    const mimeType =
      input.mimeType ??
      (Array.isArray(response.headers["content-type"])
        ? response.headers["content-type"][0]
        : response.headers["content-type"]) ??
      null;
    const extension = inferExtension({
      mimeType,
      fileName: input.originalName,
      remoteUrl: input.remoteUrl
    });
    const fileName = buildCacheFileName({
      messageId: input.messageId,
      uploadId: input.uploadId,
      hash16: sha256.slice(0, 16),
      extension
    });
    const finalPath = path.join(categoryDir, fileName);
    assertCachePath(finalPath);

    if (await fileExists(finalPath)) {
      await fsp.unlink(tmpPath);
    } else {
      await fsp.rename(tmpPath, finalPath);
    }

    const record = upsertReadyRecord({
      messageId: input.messageId,
      uploadId: input.uploadId,
      remoteUrl: input.remoteUrl,
      localPath: finalPath,
      category: input.category,
      originalName: input.originalName,
      mimeType,
      size: input.size ?? stats.size,
      sha256,
      monthKey,
      clientConversationId: input.clientConversationId
    });
    return toClientRecord(record);
  } catch (error) {
    await fsp.unlink(tmpPath).catch(() => undefined);

    // Retry on transient network errors (socket reset, timeout, etc.)
    if (
      isTransientNetworkError(error) &&
      networkRetry < NETWORK_RETRY_MAX &&
      !input.signal?.aborted
    ) {
      const delay = networkRetryDelay(networkRetry);
      log.warn(
        `Media cache download transient error, retry ${networkRetry + 1}/${NETWORK_RETRY_MAX} after ${delay}ms`,
        { url: input.remoteUrl, code: (error as NodeJS.ErrnoException).code }
      );
      await new Promise(resolve => setTimeout(resolve, delay));
      return downloadMediaCacheInternal(input, retried, networkRetry + 1);
    }

    log.error("Media cache download failed", error);
    throw error;
  }
}

async function registerLocalMediaCache(input: RegisterLocalMediaCacheInput) {
  const sourcePath = path.resolve(input.sourcePath);
  if (!(await fileExists(sourcePath))) {
    throw new Error("Local media source file does not exist");
  }

  const category = inferCategory({
    category: input.category,
    mimeType: input.mimeType,
    originalName: input.originalName || sourcePath
  });
  const createdAt = input.createdAt ? new Date(input.createdAt) : new Date();
  const monthKey = Number.isNaN(createdAt.getTime())
    ? getMonthKey()
    : getMonthKey(createdAt);
  const categoryDir = getCategoryDir({
    uid: getCurrentUid(),
    monthKey,
    category
  });
  await ensureDir(categoryDir);

  const stats = await fsp.stat(sourcePath);
  const sha256 = await fileSha256(sourcePath);
  const finalPath = path.join(
    categoryDir,
    buildCacheFileName({
      messageId: input.messageId,
      uploadId: input.uploadId,
      hash16: sha256.slice(0, 16),
      extension: inferExtension({
        mimeType: input.mimeType,
        fileName: input.originalName || sourcePath,
        remoteUrl: input.remoteUrl
      })
    })
  );
  assertCachePath(finalPath);

  if (path.resolve(sourcePath) !== path.resolve(finalPath)) {
    if (!(await fileExists(finalPath))) {
      await fsp.copyFile(sourcePath, finalPath);
    }
  }

  const record = upsertReadyRecord({
    messageId: input.messageId,
    uploadId: input.uploadId,
    remoteUrl: input.remoteUrl,
    localPath: finalPath,
    category,
    originalName: input.originalName,
    mimeType: input.mimeType,
    size: input.size ?? stats.size,
    sha256,
    monthKey,
    clientConversationId: input.clientConversationId
  });
  return toClientRecord(record);
}

async function openMediaCache(input: DownloadMediaCacheInput) {
  const record = await downloadMediaCache(input);
  const error = await shell.openPath(record.localPath);
  if (error) {
    throw new Error(error);
  }
  return record;
}

function getSaveDialogDefaultName(input: DownloadMediaCacheInput) {
  const originalName = input.originalName?.trim();
  const baseName = originalName ? path.basename(originalName) : "";
  if (baseName && baseName !== "." && baseName !== "..") {
    return baseName;
  }

  const extension = inferExtension({
    mimeType: input.mimeType,
    remoteUrl: input.remoteUrl,
    fallback: "bin"
  });
  return `mushroom-media.${extension}`;
}

async function saveMediaCacheAs(
  input: DownloadMediaCacheInput,
  parentWindow?: BrowserWindow | null
) {
  const saveDialogOptions = {
    title: "另存为",
    defaultPath: getSaveDialogDefaultName(input)
  };
  const result = parentWindow
    ? await dialog.showSaveDialog(parentWindow, saveDialogOptions)
    : await dialog.showSaveDialog(saveDialogOptions);

  if (result.canceled || !result.filePath) {
    return { canceled: true as const };
  }

  const record = await downloadMediaCache(input);
  await fsp.copyFile(record.localPath, result.filePath);
  touchRecord(record.id);
  return {
    canceled: false as const,
    filePath: result.filePath,
    record
  };
}

function getMediaCacheStats(): MediaCacheCategoryStat[] {
  const rows = getDb()
    .prepare(
      `
      SELECT
        category,
        COUNT(*) AS count,
        COALESCE(SUM(size), 0) AS size
      FROM media_cache
      WHERE user_id = ?
        AND status = 'ready'
      GROUP BY category
      ORDER BY category ASC
      `
    )
    .all(getCurrentUid()) as Array<Record<string, unknown>>;
  return rows.map(row => ({
    category: assertMediaCacheCategory(String(row.category)),
    count: Number(row.count ?? 0),
    size: Number(row.size ?? 0)
  }));
}

function getMediaCacheStatsByConversation(): MediaCacheConversationStat[] {
  const rows = getDb()
    .prepare(
      `
      SELECT
        client_conversation_id,
        category,
        COUNT(*) AS count,
        COALESCE(SUM(size), 0) AS size
      FROM media_cache
      WHERE user_id = ?
        AND status = 'ready'
      GROUP BY client_conversation_id, category
      `
    )
    .all(getCurrentUid()) as Array<Record<string, unknown>>;

  const aggregates = new Map<string, MediaCacheConversationStat>();
  for (const row of rows) {
    const rawConvId = row.client_conversation_id;
    const convId =
      rawConvId == null || rawConvId === "" ? null : String(rawConvId);
    const key = convId ?? "__orphan__";
    let stat = aggregates.get(key);
    if (!stat) {
      const byCategory = {} as Record<
        MediaCacheCategory,
        { count: number; size: number }
      >;
      for (const c of mediaCacheCategories) {
        byCategory[c] = { count: 0, size: 0 };
      }
      stat = {
        clientConversationId: convId,
        totalBytes: 0,
        fileCount: 0,
        byCategory
      };
      aggregates.set(key, stat);
    }
    const category = assertMediaCacheCategory(String(row.category));
    const count = Number(row.count ?? 0);
    const size = Number(row.size ?? 0);
    stat.byCategory[category] = { count, size };
    stat.totalBytes += size;
    stat.fileCount += count;
  }

  return Array.from(aggregates.values()).sort(
    (a, b) => b.totalBytes - a.totalBytes
  );
}

async function deleteRowsByQuery(
  whereClauses: string[],
  params: Array<string | number | null>
) {
  const rows = getDb()
    .prepare(
      `
      SELECT *
      FROM media_cache
      WHERE ${whereClauses.join(" AND ")}
      `
    )
    .all(...params) as Array<Record<string, unknown>>;

  let deletedCount = 0;
  let deletedSize = 0;
  for (const row of rows) {
    const record = normalizeRecord(row);
    try {
      assertCachePath(record.local_path);
    } catch (error) {
      log.warn("Skip media cache row outside cache root", {
        id: record.id,
        error
      });
      continue;
    }
    if (await fileExists(record.local_path)) {
      try {
        await fsp.unlink(record.local_path);
        deletedCount += 1;
        deletedSize += Number(record.size ?? 0);
      } catch {
        // 删除失败时不计入 deletedCount/deletedSize，避免 toast 虚报已释放空间。
        // 行仍然会被下方的 status='deleted' 标记为已删，便于下次重试。
      }
    }
  }

  if (rows.length > 0) {
    getDb()
      .prepare(
        `
        UPDATE media_cache
        SET status = 'deleted', updated_at = ?
        WHERE id IN (${rows.map(() => "?").join(",")})
        `
      )
      .run(nowIso(), ...rows.map(row => Number(row.id)));
  }

  return { deletedCount, deletedSize };
}

async function cleanupMediaCache(input: CleanupMediaCacheInput) {
  const clauses = ["user_id = ?", "status = 'ready'"];
  const params: Array<string | number | null> = [getCurrentUid()];

  if (input.category) {
    clauses.push("category = ?");
    params.push(assertMediaCacheCategory(input.category));
  } else if (input.categories && input.categories.length > 0) {
    const validated = input.categories.map(c => assertMediaCacheCategory(c));
    clauses.push(`category IN (${validated.map(() => "?").join(",")})`);
    for (const c of validated) {
      params.push(c);
    }
  }
  if (input.monthKey) {
    clauses.push("month_key = ?");
    params.push(input.monthKey);
  }
  if (input.olderThanDays !== undefined) {
    clauses.push("COALESCE(accessed_at, created_at) < datetime('now', ?)");
    params.push(`-${Math.max(0, input.olderThanDays)} days`);
  }

  return deleteRowsByQuery(clauses, params);
}

async function cleanupMediaCacheByConversation(
  input: CleanupMediaCacheByConversationInput
) {
  const clauses = ["user_id = ?", "status = 'ready'"];
  const params: Array<string | number | null> = [getCurrentUid()];

  if (input.clientConversationId) {
    clauses.push("client_conversation_id = ?");
    params.push(String(input.clientConversationId));
  } else {
    clauses.push(
      "(client_conversation_id IS NULL OR client_conversation_id = '')"
    );
  }

  if (input.categories && input.categories.length > 0) {
    const validated = input.categories.map(c => assertMediaCacheCategory(c));
    clauses.push(`category IN (${validated.map(() => "?").join(",")})`);
    for (const c of validated) {
      params.push(c);
    }
  }

  if (input.olderThanDays !== undefined) {
    clauses.push("COALESCE(accessed_at, created_at) < datetime('now', ?)");
    params.push(`-${Math.max(0, input.olderThanDays)} days`);
  }

  return deleteRowsByQuery(clauses, params);
}

export function setupMediaCacheIpcHandlers() {
  ipcMain.handle(
    "media-cache:resolve",
    (_event, input: ResolveMediaCacheInput) => resolveMediaCache(input)
  );
  ipcMain.handle(
    "media-cache:download",
    (_event, input: DownloadMediaCacheInput) => downloadMediaCache(input)
  );
  ipcMain.handle(
    "media-cache:register-local",
    (_event, input: RegisterLocalMediaCacheInput) =>
      registerLocalMediaCache(input)
  );
  ipcMain.handle("media-cache:open", (_event, input: DownloadMediaCacheInput) =>
    openMediaCache(input)
  );
  ipcMain.handle(
    "media-cache:save-as",
    (event, input: DownloadMediaCacheInput) =>
      saveMediaCacheAs(input, BrowserWindow.fromWebContents(event.sender))
  );
  ipcMain.handle("media-cache:stats", () => getMediaCacheStats());
  ipcMain.handle("media-cache:stats-by-conv", () =>
    getMediaCacheStatsByConversation()
  );
  ipcMain.handle(
    "media-cache:cleanup",
    (_event, input: CleanupMediaCacheInput) => cleanupMediaCache(input)
  );
  ipcMain.handle(
    "media-cache:cleanup-by-conv",
    (_event, input: CleanupMediaCacheByConversationInput) =>
      cleanupMediaCacheByConversation(input)
  );
}

export function setupMediaCacheProtocol() {
  registerMediaCacheProtocolForSession(session.defaultSession);
}

const sessionsWithMediaCacheProtocol = new WeakSet<Electron.Session>();

const handleMediaCacheRequest: Parameters<
  Electron.Protocol["handle"]
>[1] = async request => {
  try {
    const localPath = parseLocalMediaCacheUrl(request.url);
    assertCachePath(localPath);
    if (!(await fileExists(localPath))) {
      return new Response("Not found", { status: 404 });
    }
    return net.fetch(pathToFileURL(localPath).toString());
  } catch (error) {
    log.error("Media cache protocol request failed", error);
    return new Response("Forbidden", { status: 403 });
  }
};

/**
 * 把 `mushroom-media-cache://` 协议注册到指定的 session。
 *
 * Electron 的 `protocol.handle` 是 per-session 的：在 default session 上注册
 * 不会自动应用到 `persist:user-<uid>` / `persist:anon` 等自定义 partition。
 * BrowserWindow 使用自定义 partition 时（见 multi-account-isolation 设计），
 * 必须显式对每个 partition session 调用此函数，否则 renderer 加载
 * `mushroom-media-cache://...` 会得到 `ERR_UNKNOWN_URL_SCHEME`。
 *
 * 内部用 WeakSet 去重，避免重复注册导致 "scheme already handled" 抛错。
 */
export function registerMediaCacheProtocolForSession(ses: Electron.Session) {
  if (sessionsWithMediaCacheProtocol.has(ses)) {
    return;
  }
  ses.protocol.handle(mediaCacheProtocol, handleMediaCacheRequest);
  sessionsWithMediaCacheProtocol.add(ses);
}
