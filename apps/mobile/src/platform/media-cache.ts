import * as RNFS from "react-native-fs";
import { AppState, type AppStateStatus } from "react-native";
import type { QueryResult, QueryResultRow } from "react-native-nitro-sqlite";
import { getMobileSQLiteConnection } from "../data/sqlite-connection";
import { accountNamespace } from "../services/account-namespace";
import { refreshAttachmentUrlsAndCache } from "../services/refresh-attachment-urls";
import log from "../utils/log";
import { getCurrentNetworkType } from "./network-type";
export type MobileMediaCacheCategory =
  | "images"
  | "files"
  | "voice"
  | "video"
  | "thumbs";

export type MobileMediaCacheStatus =
  | "downloading"
  | "ready"
  | "missing"
  | "failed"
  | "deleted";

export interface MobileMediaCacheInput {
  username: string;
  remoteUrl: string;
  category: MobileMediaCacheCategory;
  messageId?: string | null;
  uploadId?: string | null;
  originalName?: string | null;
  mimeType?: string | null;
  size?: number | null;
}

export interface MobileMediaCacheRecord extends MobileMediaCacheInput {
  id: number;
  monthKey: string;
  localPath: string;
  localUri: string;
  sha256: string;
  status: MobileMediaCacheStatus;
  createdAt: string;
  updatedAt: string;
  lastAccessedAt: string;
}

type SQLiteRow = QueryResultRow;

interface ActiveDownloadEntry {
  promise: Promise<MobileMediaCacheRecord>;
  // 若任务仍在 autoQueue 中等待派发，则指向其条目；任务一旦开跑（或本就是手动直通）则置 null
  queued: QueuedAutoTask | null;
}

// Per-account cache layout (decided in docs/account.md §六):
// - Downloaded media (reproducible from the server, OS may evict on
//   low-storage warnings) → Caches/users/<uid>/media/...
// - Outbox attachments awaiting upload (NOT reproducible, must survive
//   OS purge) → AppSupport/users/<uid>/outbox/...
// When no user is bound we fall back to a transient "anon" folder so
// pre-login flows (if any) don't crash; nothing real should ever land
// there in practice.
export function getMediaCacheRoot(): string {
  const uid = accountNamespace.get() ?? "anon";
  return `${RNFS.CachesDirectoryPath}/users/${uid}/media`;
}

export function getMobileOutboxRoot(): string {
  const uid = accountNamespace.get() ?? "anon";
  const base =
    (RNFS as unknown as { LibraryDirectoryPath?: string })
      .LibraryDirectoryPath ?? RNFS.DocumentDirectoryPath;
  return `${base}/users/${uid}/outbox`;
}
const activeDownloads = new Map<string, ActiveDownloadEntry>();

function rowsFromResult<Row extends SQLiteRow>(
  result: QueryResult<Row>
): Row[] {
  return (result.results as Row[] | undefined) ?? result.rows?._array ?? [];
}

async function queryRows<Row extends SQLiteRow>(
  query: string,
  params: Parameters<
    ReturnType<typeof getMobileSQLiteConnection>["executeAsync"]
  >[1] = []
) {
  return rowsFromResult(
    await getMobileSQLiteConnection().executeAsync<Row>(query, params)
  );
}

function normalizeUsername(username: string) {
  return (
    username
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "_")
      .replace(/^_+|_+$/g, "") || "unknown"
  );
}

function getMonthKey(date = new Date()) {
  return `${date.getFullYear()}_${String(date.getMonth() + 1).padStart(
    2,
    "0"
  )}`;
}

function getCacheKey(input: MobileMediaCacheInput) {
  return `${normalizeUsername(input.username)}:${input.category}:${input.remoteUrl}`;
}

function toLocalUri(localPath: string) {
  return localPath.startsWith("file://") ? localPath : `file://${localPath}`;
}

function inferExtension(
  input: Pick<MobileMediaCacheInput, "originalName" | "mimeType">
) {
  const fromName = String(input.originalName || "")
    .split("?")[0]
    .match(/\.([a-z0-9]{1,12})$/i)?.[1];
  if (fromName) {
    return fromName.toLowerCase();
  }

  const mimeType = String(input.mimeType || "").toLowerCase();
  const byMime: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/svg+xml": "svg",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/m4a": "m4a",
    "audio/aac": "aac",
    "audio/wav": "wav",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "video/webm": "webm",
    "application/pdf": "pdf"
  };
  return byMime[mimeType] ?? "bin";
}

async function ensureSchema() {
  const db = getMobileSQLiteConnection();
  await db.executeAsync(`
    CREATE TABLE IF NOT EXISTS media_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      remote_url TEXT NOT NULL,
      category TEXT NOT NULL,
      message_id TEXT,
      upload_id TEXT,
      original_name TEXT,
      mime_type TEXT,
      size INTEGER,
      sha256 TEXT,
      local_path TEXT,
      month_key TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_accessed_at TEXT NOT NULL
    )
  `);
  await db.executeAsync(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_mobile_media_cache_remote_category
    ON media_cache (username, remote_url, category)
  `);
  await db.executeAsync(`
    CREATE INDEX IF NOT EXISTS idx_mobile_media_cache_sha
    ON media_cache (username, sha256, category)
  `);
  await db.executeAsync(`
    CREATE INDEX IF NOT EXISTS idx_mobile_media_cache_upload
    ON media_cache (username, upload_id, category)
  `);
}

function mapRecord(row: SQLiteRow): MobileMediaCacheRecord {
  const localPath = String(row.local_path || "");
  return {
    id: Number(row.id || 0),
    username: String(row.username || ""),
    remoteUrl: String(row.remote_url || ""),
    category: String(row.category || "files") as MobileMediaCacheCategory,
    messageId: row.message_id ? String(row.message_id) : null,
    uploadId: row.upload_id ? String(row.upload_id) : null,
    originalName: row.original_name ? String(row.original_name) : null,
    mimeType: row.mime_type ? String(row.mime_type) : null,
    size: row.size == null ? null : Number(row.size),
    sha256: String(row.sha256 || ""),
    localPath,
    localUri: localPath ? toLocalUri(localPath) : "",
    monthKey: String(row.month_key || ""),
    status: String(row.status || "missing") as MobileMediaCacheStatus,
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
    lastAccessedAt: String(row.last_accessed_at || "")
  };
}

async function upsertRecord(input: {
  cacheInput: MobileMediaCacheInput;
  localPath?: string;
  sha256?: string;
  status: MobileMediaCacheStatus;
  monthKey: string;
}) {
  await ensureSchema();
  const now = new Date().toISOString();
  const username = normalizeUsername(input.cacheInput.username);
  await getMobileSQLiteConnection().executeAsync(
    `INSERT INTO media_cache (
       username,
       remote_url,
       category,
       message_id,
       upload_id,
       original_name,
       mime_type,
       size,
       sha256,
       local_path,
       month_key,
       status,
       created_at,
       updated_at,
       last_accessed_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(username, remote_url, category) DO UPDATE SET
       message_id = COALESCE(excluded.message_id, media_cache.message_id),
       upload_id = COALESCE(excluded.upload_id, media_cache.upload_id),
       original_name = COALESCE(excluded.original_name, media_cache.original_name),
       mime_type = COALESCE(excluded.mime_type, media_cache.mime_type),
       size = COALESCE(excluded.size, media_cache.size),
       sha256 = COALESCE(excluded.sha256, media_cache.sha256),
       local_path = COALESCE(excluded.local_path, media_cache.local_path),
       month_key = excluded.month_key,
       status = excluded.status,
       updated_at = excluded.updated_at,
       last_accessed_at = excluded.last_accessed_at`,
    [
      username,
      input.cacheInput.remoteUrl,
      input.cacheInput.category,
      input.cacheInput.messageId || null,
      input.cacheInput.uploadId || null,
      input.cacheInput.originalName || null,
      input.cacheInput.mimeType || null,
      input.cacheInput.size ?? null,
      input.sha256 || null,
      input.localPath || null,
      input.monthKey,
      input.status,
      now,
      now,
      now
    ]
  );
}

/** 同步版缓存查询，用于 UI 首次渲染时需要立即拿到缓存 URI 的场景。 */
export function resolveMobileMediaCacheSync(
  input: MobileMediaCacheInput
): MobileMediaCacheRecord | null {
  try {
    const db = getMobileSQLiteConnection();
    const username = normalizeUsername(input.username);

    // Primary: lookup by remote_url (content.url — 可能因自愈更新而变化)
    let rows = rowsFromResult(
      db.execute<SQLiteRow>(
        `SELECT * FROM media_cache
         WHERE username = ? AND remote_url = ? AND category = ? AND status = 'ready'
         LIMIT 1`,
        [username, input.remoteUrl, input.category]
      )
    );

    // Fallback: lookup by upload_id（附件生命周期内稳定不变，不受预签名 URL
    // 过期/自愈影响）。当 content.url 因 refresh-attachment-persist 被改写
    // 导致 cache key 不匹配时仍能命中本地缓存。
    if (!rows.length && input.uploadId) {
      rows = rowsFromResult(
        db.execute<SQLiteRow>(
          `SELECT * FROM media_cache
           WHERE username = ? AND upload_id = ? AND category = ? AND status = 'ready'
           LIMIT 1`,
          [username, input.uploadId, input.category]
        )
      );
    }

    if (!rows.length) return null;
    const record = mapRecord(rows[0]);
    return record.localUri ? record : null;
  } catch {
    return null;
  }
}

export async function resolveMobileMediaCache(input: MobileMediaCacheInput) {
  await ensureSchema();
  const username = normalizeUsername(input.username);

  // Primary: lookup by remote_url.
  let rows = await queryRows<SQLiteRow>(
    `SELECT * FROM media_cache
     WHERE username = ? AND remote_url = ? AND category = ? AND status <> 'deleted'
     LIMIT 1`,
    [username, input.remoteUrl, input.category]
  );

  // Fallback: lookup by upload_id（同 sync 版本，cover 「content.url 被自愈
  // 改写后 cache key 不匹配」的场景）。
  if (!rows.length && input.uploadId) {
    rows = await queryRows<SQLiteRow>(
      `SELECT * FROM media_cache
       WHERE username = ? AND upload_id = ? AND category = ? AND status <> 'deleted'
       LIMIT 1`,
      [username, input.uploadId, input.category]
    );
  }
  const record = rows[0] ? mapRecord(rows[0]) : null;
  if (!record?.localPath || record.status !== "ready") {
    return record;
  }

  if (await RNFS.exists(record.localPath)) {
    const now = new Date().toISOString();
    await getMobileSQLiteConnection().executeAsync(
      `UPDATE media_cache SET last_accessed_at = ? WHERE id = ?`,
      [now, record.id]
    );
    return record;
  }

  await getMobileSQLiteConnection().executeAsync(
    `UPDATE media_cache SET status = 'missing', updated_at = ? WHERE id = ?`,
    [new Date().toISOString(), record.id]
  );
  return {
    ...record,
    status: "missing" as const
  };
}

async function findDuplicate(input: {
  username: string;
  sha256: string;
  category: MobileMediaCacheCategory;
}) {
  const rows = await queryRows<SQLiteRow>(
    `SELECT * FROM media_cache
     WHERE username = ? AND sha256 = ? AND category = ? AND status = 'ready'
     ORDER BY last_accessed_at DESC
     LIMIT 1`,
    [normalizeUsername(input.username), input.sha256, input.category]
  );
  const record = rows[0] ? mapRecord(rows[0]) : null;
  if (record?.localPath && (await RNFS.exists(record.localPath))) {
    return record;
  }
  return null;
}

/**
 * 检查文件是否为有效的图片内容（魔数检测）。
 * 避免 CDN 返回的 HTML 错误页、XML 签名过期页等被当作合法图片缓存，
 * 防止不同消息因相同的错误页面 sha256 而相互污染缓存。
 */
async function isValidImageFile(filePath: string): Promise<boolean> {
  try {
    const stat = await RNFS.stat(filePath);
    // 真实图片至少数百字节；过小的文件很可能是 CDN 错误响应。
    if (stat.size < 200) return false;
    // 读取前 8 字节，用 base64 编码检测常见图片格式魔数
    const header = await RNFS.read(filePath, 8, 0, "base64");
    return (
      header.startsWith("/9j/") || // JPEG (FF D8 FF)
      header.startsWith("iVBOR") || // PNG (89 50 4E 47)
      header.startsWith("R0lGO") || // GIF (47 49 46 38/39)
      header.startsWith("UklGR") // WebP (RIFF … WEBP)
    );
  } catch {
    return false;
  }
}

function buildUniqueLocalPath(
  categoryDir: string,
  sha256: string,
  extension: string
): string {
  return `${categoryDir}/${sha256}_${Date.now()}.${extension}`;
}

async function downloadMobileMediaCacheInternal(
  input: MobileMediaCacheInput,
  retried = false
) {
  const resolved = await resolveMobileMediaCache(input);
  if (resolved?.status === "ready" && resolved.localPath) {
    return resolved;
  }

  const monthKey = getMonthKey();
  const username = normalizeUsername(input.username);
  const categoryDir = `${getMediaCacheRoot()}/${username}/${monthKey}/${input.category}`;
  const tmpPath = `${categoryDir}/.download-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}.tmp`;
  await RNFS.mkdir(categoryDir);
  await upsertRecord({
    cacheInput: input,
    status: "downloading",
    monthKey
  });

  try {
    const result = await RNFS.downloadFile({
      fromUrl: input.remoteUrl,
      toFile: tmpPath,
      readTimeout: 60_000,
      connectionTimeout: 20_000
    }).promise;
    if (result.statusCode < 200 || result.statusCode >= 300) {
      // 私有 bucket 的预签名 URL 过期后会返回 403（个别 SDK 在对象/签名失配时
      // 返回 404）。尝试调服务端 refresh-urls 拿到新签名 URL 后重试一次；
      // 仍失败则按原逻辑抛出，调用方/UI 层可自行降级。
      if (
        (result.statusCode === 403 || result.statusCode === 404) &&
        !retried &&
        input.uploadId
      ) {
        await RNFS.unlink(tmpPath).catch(() => undefined);
        const refreshed = await refreshAttachmentUrlsAndCache(
          [input.uploadId],
          input.messageId
            ? { messageIds: { [input.uploadId]: input.messageId } }
            : undefined
        );
        const fresh = refreshed[input.uploadId];
        const newUrl =
          input.category === "thumbs"
            ? (fresh?.thumb_url ?? fresh?.preview_url ?? fresh?.url)
            : fresh?.url;
        if (newUrl && newUrl !== input.remoteUrl) {
          return downloadMobileMediaCacheInternal(
            { ...input, remoteUrl: newUrl },
            true
          );
        }
      }
      throw new Error(`Media download failed: ${result.statusCode}`);
    }

    // 内容有效性检测：图片类文件必须是真正的图片格式，避免 CDN 返回的
    // HTML 错误页面被当作合法图片缓存（这会污染其他消息的图片显示）。
    if (input.category === "images" && !(await isValidImageFile(tmpPath))) {
      const mediaLog = log.scope("media-cache");
      mediaLog.warn("downloaded content not a valid image, will retry", {
        remoteUrl: input.remoteUrl?.slice(-40),
        uploadId: input.uploadId
      });
      await RNFS.unlink(tmpPath).catch(() => undefined);
      // 有 uploadId 且未重试过 → 刷新 URL 后重试一次
      if (input.uploadId && !retried) {
        const refreshed = await refreshAttachmentUrlsAndCache(
          [input.uploadId],
          input.messageId
            ? { messageIds: { [input.uploadId]: input.messageId } }
            : undefined
        );
        const fresh = refreshed[input.uploadId];
        const newUrl = fresh?.url;
        if (newUrl && newUrl !== input.remoteUrl) {
          return downloadMobileMediaCacheInternal(
            { ...input, remoteUrl: newUrl },
            true
          );
        }
      }
      throw new Error("Downloaded content is not a valid image");
    }

    const sha256 = await RNFS.hash(tmpPath, "sha256");
    // 按 content sha256 查找内容完全相同的已缓存文件。
    // 注意：不同 remoteUrl 即使 sha256 相同也不能直接复用 ——
    // 「预签名 URL 过期后返回了相同错误页面」等场景会导致
    // 新消息错误地显示其他消息的图片内容。
    const duplicate = await findDuplicate({
      username,
      sha256,
      category: input.category
    });
    // 仅当 duplicate 的 remote_url 与当前输入一致时才可复用本地路径，
    // 避免不同消息因意外 content hash 碰撞而相互污染缓存。
    let localPath =
      duplicate?.remoteUrl === input.remoteUrl ? duplicate.localPath : "";
    if (localPath) {
      await RNFS.unlink(tmpPath).catch(() => undefined);
    } else {
      const extension = inferExtension(input);
      const basePath = `${categoryDir}/${sha256}.${extension}`;
      if (duplicate) {
        // duplicate 存在但 remoteUrl 不匹配 → 用唯一文件名避免覆盖
        localPath = buildUniqueLocalPath(categoryDir, sha256, extension);
        await RNFS.moveFile(tmpPath, localPath);
      } else if (await RNFS.exists(basePath)) {
        // 文件已存在于 sha256 路径，但无 duplicate 记录（可能来自其他清理或
        // 并发下载），用唯一文件名避免复用。
        localPath = buildUniqueLocalPath(categoryDir, sha256, extension);
        await RNFS.moveFile(tmpPath, localPath);
      } else {
        localPath = basePath;
        await RNFS.moveFile(tmpPath, localPath);
      }
    }

    await upsertRecord({
      cacheInput: input,
      localPath,
      sha256,
      status: "ready",
      monthKey
    });

    const next = await resolveMobileMediaCache(input);
    if (!next || next.status !== "ready") {
      throw new Error("Media cache record was not persisted.");
    }
    notifyCacheWrite(input);
    return next;
  } catch (error) {
    await RNFS.unlink(tmpPath).catch(() => undefined);
    await upsertRecord({
      cacheInput: input,
      status: "failed",
      monthKey
    });
    throw error;
  }
}

export async function downloadMobileMediaCache(
  input: MobileMediaCacheInput,
  options?: { auto?: boolean }
) {
  const key = getCacheKey(input);
  const isAuto = options?.auto === true;
  const runner = () => downloadMobileMediaCacheInternal(input);

  const existing = activeDownloads.get(key);
  if (existing) {
    // 已经在跑（或本身是手动直通） → 直接复用
    if (!existing.queued) {
      return existing.promise;
    }
    // 仍在 auto 队列等待派发：
    // - 若调用方也是 auto → 复用同一个 promise，等队列轮到它
    if (isAuto) {
      return existing.promise;
    }
    // - 若调用方是手动 → 抢占：取消队列条目，立即直通运行
    const queued = existing.queued;
    queued.cancelled = true;
    const promotedPromise = runner();
    // 让原本等待 auto 排队的调用方也复用此次直通运行的结果，避免悬挂
    promotedPromise.then(
      value => queued.resolve(value),
      reason => queued.reject(reason)
    );
    const promotedEntry: ActiveDownloadEntry = {
      promise: promotedPromise,
      queued: null
    };
    activeDownloads.set(key, promotedEntry);
    // 使用 then(cleanup, cleanup) 而非 `void p.finally(...)`：后者会返回一条
    // 新的 promise，把上游 rejection 重新抛成 UnhandledPromiseRejection
    // （即使调用方对 entry.promise 自己 .catch 也救不了 finally 分支）。
    const cleanupPromoted = () => {
      if (activeDownloads.get(key) === promotedEntry) {
        activeDownloads.delete(key);
      }
    };
    promotedPromise.then(cleanupPromoted, cleanupPromoted);
    return promotedPromise;
  }

  // 全新调用：创建 entry 并放入 map，再清理生命周期
  const entry: ActiveDownloadEntry = {
    promise: undefined as unknown as Promise<MobileMediaCacheRecord>,
    queued: null
  };

  if (isAuto) {
    const scheduled = createScheduledAutoDownload(runner);
    entry.promise = scheduled.promise;
    entry.queued = scheduled.task;
  } else {
    entry.promise = runner();
  }

  activeDownloads.set(key, entry);
  // 见 promoted 分支中的同样注释：避免 finally 链路把 rejection 重新抛成
  // UnhandledPromiseRejection。
  const cleanupEntry = () => {
    if (activeDownloads.get(key) === entry) {
      activeDownloads.delete(key);
    }
  };
  entry.promise.then(cleanupEntry, cleanupEntry);
  return entry.promise;
}

// ---------------------------------------------------------------------------
// 自动下载并发调度器
// ---------------------------------------------------------------------------
// 仅作用于 `downloadMobileMediaCache(..., { auto: true })`。
// - 并发上限由 getAutoDownloadConcurrency() 按网络类型动态决定：
//   WiFi 6 / 蜂窝 4 / 其他 3，防止「群聊瞬间灌入大文件压满带宽」。
// - 当 App 进入 background 时暂停派发新任务（已在跑的任务自然完成）；
//   回到 active 后自动继续。
// - 用户主动调用（auto=false）走直通路径，不受队列限制。
// - 若手动调用命中了「已排队但未开跑」的同 key auto 任务，则抢占执行（见
//   downloadMobileMediaCache 中的 promotion 逻辑）。

interface QueuedAutoTask {
  run: () => Promise<MobileMediaCacheRecord>;
  resolve: (value: MobileMediaCacheRecord) => void;
  reject: (reason: unknown) => void;
  cancelled: boolean;
}

const autoQueue: QueuedAutoTask[] = [];
let autoRunning = 0;
// 仅 background 视为暂停；与 handleAppStateChange 一致，避免 iOS `inactive` 瞬态误暂停。
let autoPaused: boolean =
  AppState?.currentState === "background" ? true : false;

function getAutoDownloadConcurrency(): number {
  switch (getCurrentNetworkType()) {
    case "wifi":
      return 6;
    case "cellular":
      return 4;
    default:
      return 3;
  }
}

function pumpAutoQueue() {
  if (autoPaused) {
    return;
  }
  const max = getAutoDownloadConcurrency();
  while (autoRunning < max && autoQueue.length > 0) {
    const next = autoQueue.shift();
    if (!next) {
      break;
    }
    if (next.cancelled) {
      // 已被手动调用抢占，跳过；resolve/reject 由抢占方负责
      continue;
    }
    autoRunning += 1;
    next
      .run()
      .then(value => next.resolve(value))
      .catch(reason => next.reject(reason))
      .finally(() => {
        autoRunning -= 1;
        pumpAutoQueue();
      });
  }
}

// ---------------------------------------------------------------------------
// 缓存写入通知（供 useFileCache 等 hook 订阅，在外部写入缓存后主动重新检查）
// ---------------------------------------------------------------------------

export type CacheWritePayload = {
  remoteUrl: string;
  uploadId?: string | null;
};

const cacheWriteListeners = new Set<(payload: CacheWritePayload) => void>();

export function subscribeCacheWrites(
  listener: (payload: CacheWritePayload) => void
): () => void {
  cacheWriteListeners.add(listener);
  return () => {
    cacheWriteListeners.delete(listener);
  };
}

function notifyCacheWrite(input: MobileMediaCacheInput) {
  const payload: CacheWritePayload = {
    remoteUrl: input.remoteUrl,
    uploadId: input.uploadId
  };
  cacheWriteListeners.forEach(fn => fn(payload));
}

function createScheduledAutoDownload(
  run: () => Promise<MobileMediaCacheRecord>
): { promise: Promise<MobileMediaCacheRecord>; task: QueuedAutoTask } {
  let task: QueuedAutoTask;
  const promise = new Promise<MobileMediaCacheRecord>((resolve, reject) => {
    task = { run, resolve, reject, cancelled: false };
    autoQueue.push(task);
    pumpAutoQueue();
  });
  return { promise, task: task! };
}

function handleAppStateChange(next: AppStateStatus) {
  if (next === "active") {
    autoPaused = false;
    pumpAutoQueue();
  } else if (next === "background") {
    autoPaused = true;
  }
}

if (AppState?.addEventListener) {
  AppState.addEventListener("change", handleAppStateChange);
}
