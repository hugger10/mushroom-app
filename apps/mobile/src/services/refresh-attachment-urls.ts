/**
 * 移动端附件预签名 URL 自愈助手。
 *
 * 触发场景：
 *   - 旧消息缓存的 MinIO presigned URL 过期，`<Image>` / `<Video>` 加载失败 (onError)；
 *   - 后台媒体下载收到 403/404；
 *   - 会话打开时主动批量预刷新（A 方案）。
 *
 * 设计要点：
 *   - **80ms 微批合并**：短窗口内多个单 id 调用会被合并成一次网络请求（≤100/批，
 *     超过自动分批），消除"一个会话 N 张图就 N 次请求"的风暴。
 *   - **进程内 memoryCache** 供本进程后续渲染复用。
 *   - **SQLite 写回**：若调用方提供了 messageId，则把新 URL 持久化到 mobile_messages，
 *     与桌面端 `db:update-message-attachment` 行为对齐，使 TTL 内冷启动无需再次自愈。
 */

import { mobileServerApi } from "./app-runtime";
import { updateMessageAttachmentInDb } from "../data/repo/refresh-attachment-persist";
import log from "../utils/log";

const attLog = log.scope("media");

export interface RefreshedAttachmentInfo {
  url?: string;
  thumb_url?: string;
  preview_url?: string;
  thumb_status: "none" | "pending" | "ready" | "failed";
}

export interface RefreshAttachmentOptions {
  /**
   * upload_id -> messageId 映射。messageId 既可以是 client_message_id 也可以是
   * server_message_id（持久化层会按序尝试）。提供后会触发 SQLite 写回。
   */
  messageIds?: Record<string, string | undefined | null>;
}

const MICRO_BATCH_MS = 80;
const MAX_BATCH_SIZE = 100;

const memoryCache = new Map<string, RefreshedAttachmentInfo>();
const subscribers = new Set<(uploadIds: string[]) => void>();

/**
 * 会话级附件 URL 预刷新去重缓存：conversationId -> 最近成功发起预刷新的时间戳（ms）。
 *
 * 用途：进入会话时一次性把首屏可见消息的 upload_ids 批量送给
 * `/file/attachment/refresh-urls` 预刷新（A 方案）。如果用户来回切换
 * 同一个会话或在多个会话间反复跳转，应在 TTL 之内跳过重复请求。
 *
 * TTL 选择 30 分钟：服务端 `UPLOAD_PRESIGNED_EXPIRES_SECONDS` 默认 1h，
 * 留出至少 30 分钟安全余量；过期后用户回来时主动再预刷新一次。
 *
 * 跨账号必须显式清理（见 `resetMobileAttachmentRefreshCache`），否则
 * 跨账号同名 conversation id 会被误判为"刚刷新过"。
 */
export const conversationPreRefreshedAt = new Map<string, number>();
export const PRE_REFRESH_TTL_MS = 30 * 60 * 1000;

/**
 * 清空本进程内自愈/预刷新相关的所有缓存。
 *
 * 调用时机：每次 `mobileAppController.logout(...)`（含 wipeLocalData=false
 * 的普通登出 / 401 强制登出 / 切换账号），由 `app-runtime.ts` 的
 * `onUserUnbound` 钩子统一触发。
 *
 * **只清缓存数据**，不动 `pending` / `flushTimer`：进行中的批量请求让其
 * 自然 settle（waiter 会在 finally 中收到 undefined），避免主动清理造成
 * 调用方挂起或访问已 detach 的会话状态。
 */
export function resetMobileAttachmentRefreshCache(): void {
  memoryCache.clear();
  conversationPreRefreshedAt.clear();
}

interface PendingEntry {
  uploadId: string;
  messageId?: string;
  waiters: Array<(info: RefreshedAttachmentInfo | undefined) => void>;
}

const pending = new Map<string, PendingEntry>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let inflightCount = 0;

export function getRefreshedAttachment(
  uploadId: string | undefined | null
): RefreshedAttachmentInfo | undefined {
  if (!uploadId) return undefined;
  return memoryCache.get(uploadId);
}

export function subscribeToAttachmentRefresh(
  listener: (uploadIds: string[]) => void
) {
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
  };
}

function notifySubscribers(uploadIds: string[]) {
  if (uploadIds.length === 0) return;
  for (const fn of subscribers) {
    try {
      fn(uploadIds);
    } catch {
      /* ignore subscriber errors */
    }
  }
}

function scheduleFlush() {
  // 与 apps/web/src/http/refreshAttachmentUrls.ts 对齐：累积到 ≥ MAX_BATCH_SIZE
  // 时立刻 flush（即使已有定时器，也要先 clear 再立即触发），避免最多额外
  // 等待 80ms 才发出请求。
  if (pending.size >= MAX_BATCH_SIZE) {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    void flushPending();
    return;
  }
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushPending();
  }, MICRO_BATCH_MS);
}

async function flushPending() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (pending.size === 0) return;

  // Snapshot + clear so concurrent adds start a fresh batch.
  const entries = Array.from(pending.values());
  pending.clear();

  // Chunk into ≤100/请求.
  for (let offset = 0; offset < entries.length; offset += MAX_BATCH_SIZE) {
    const chunk = entries.slice(offset, offset + MAX_BATCH_SIZE);
    inflightCount += 1;
    void executeBatch(chunk).finally(() => {
      inflightCount -= 1;
    });
  }
}

async function executeBatch(entries: PendingEntry[]) {
  const ids = entries.map(e => e.uploadId);
  const startedAt = Date.now();
  let refreshed = 0;
  let failed = false;
  let items: Record<string, RefreshedAttachmentInfo> = {};

  try {
    const res = await mobileServerApi.refreshAttachmentUrls({
      upload_ids: ids
    });
    if (res?.code !== 0 || !res.data?.items) {
      failed = true;
    } else {
      items = res.data.items as Record<string, RefreshedAttachmentInfo>;
      const updated: string[] = [];
      for (const [uploadId, info] of Object.entries(items)) {
        memoryCache.set(uploadId, info);
        updated.push(uploadId);
      }
      refreshed = updated.length;

      // 持久化到 SQLite（仅当调用侧提供了 messageId）。
      const persistTasks: Array<Promise<void>> = [];
      for (const entry of entries) {
        const info = items[entry.uploadId];
        if (!info || !entry.messageId) continue;
        persistTasks.push(
          updateMessageAttachmentInDb(
            entry.messageId,
            entry.uploadId,
            info
          ).catch(err => {
            attLog.warn("refreshAttachmentUrls persist failed", {
              uploadId: entry.uploadId,
              messageId: entry.messageId,
              err: err instanceof Error ? err.message : String(err)
            });
          })
        );
      }
      if (persistTasks.length > 0) {
        await Promise.all(persistTasks);
      }

      notifySubscribers(updated);
    }
  } catch (err) {
    failed = true;
    attLog.warn("refreshAttachmentUrls error", {
      requested: ids.length,
      err: err instanceof Error ? err.message : String(err)
    });
  } finally {
    // Resolve all waiters with their respective info (or undefined on miss/fail).
    for (const entry of entries) {
      const info = items[entry.uploadId];
      for (const resolve of entry.waiters) {
        try {
          resolve(info);
        } catch {
          /* ignore */
        }
      }
    }
    attLog.info("refreshAttachmentUrls", {
      requested: ids.length,
      refreshed,
      failed: failed ? ids.length - refreshed : 0,
      ms: Date.now() - startedAt
    });
  }
}

export async function refreshAttachmentUrlsAndCache(
  uploadIds: Array<string | undefined | null>,
  options?: RefreshAttachmentOptions
): Promise<Record<string, RefreshedAttachmentInfo>> {
  const ids = Array.from(
    new Set(
      uploadIds.map(id => String(id || "").trim()).filter(id => id.length > 0)
    )
  );
  if (ids.length === 0) return {};

  // Promise per requested id (those merged via pending share the same resolver list).
  const waitPromises: Array<
    Promise<[string, RefreshedAttachmentInfo | undefined]>
  > = [];

  for (const uploadId of ids) {
    const messageId = options?.messageIds?.[uploadId];
    waitPromises.push(
      new Promise(resolve => {
        const resolver = (info: RefreshedAttachmentInfo | undefined) => {
          resolve([uploadId, info]);
        };
        const existing = pending.get(uploadId);
        if (existing) {
          // 若新调用带 messageId 而老的没有，补上以便持久化。
          if (!existing.messageId && messageId) {
            existing.messageId = String(messageId);
          }
          existing.waiters.push(resolver);
        } else {
          pending.set(uploadId, {
            uploadId,
            messageId: messageId ? String(messageId) : undefined,
            waiters: [resolver]
          });
        }
      })
    );
  }

  scheduleFlush();

  const settled = await Promise.all(waitPromises);
  const result: Record<string, RefreshedAttachmentInfo> = {};
  for (const [id, info] of settled) {
    const cached = info ?? memoryCache.get(id);
    if (cached) result[id] = cached;
  }
  return result;
}

/** Testing helper: returns true when there are no pending or in-flight batches. */
export function _isRefreshIdleForTest() {
  return pending.size === 0 && inflightCount === 0 && flushTimer === null;
}
