/**
 * 客户端附件预签名 URL 自愈钩子。
 *
 * 触发场景：
 *   - 旧消息缓存的 MinIO presigned URL 过期，<img>/<video> 加载失败 (onError)；
 *   - 会话打开时主动批量预刷新（A 方案）。
 *
 * 设计要点：
 *   - **80ms 微批合并**：短窗口内多个单 id 调用会合并成一次网络请求（≤100/批，
 *     超过自动分批）。
 *   - **写入进程内 memory cache**：纯 web 环境也能用上新 URL。
 *   - **Electron 路径**：通过 `window.electronAPI.updateMessageAttachment` 持久化
 *     到主进程 SQLite，TTL 内冷启动无需再次自愈。
 */

import log from "@/utils/log";
import webServerApi from "./index";
import { hasDesktopMediaCache } from "../components/chat/messageMediaCache";
import { setRefreshedAttachmentWeb } from "./refreshedAttachmentCache";

const attLog = log.scope("media");

export interface RefreshAttachmentResult {
  url?: string;
  thumb_url?: string;
  preview_url?: string;
  thumb_status: "none" | "pending" | "ready" | "failed";
}

const MICRO_BATCH_MS = 80;
const MAX_BATCH_SIZE = 100;

interface PendingEntry {
  uploadId: string;
  waiters: Array<(info: RefreshAttachmentResult | undefined) => void>;
}

const pending = new Map<string, PendingEntry>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleFlush() {
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

  const entries = Array.from(pending.values());
  pending.clear();

  for (let offset = 0; offset < entries.length; offset += MAX_BATCH_SIZE) {
    const chunk = entries.slice(offset, offset + MAX_BATCH_SIZE);
    void executeBatch(chunk);
  }
}

async function executeBatch(entries: PendingEntry[]) {
  const ids = entries.map(e => e.uploadId);
  const startedAt = Date.now();
  let refreshed = 0;
  let failed = false;
  let resolved: Record<string, RefreshAttachmentResult> = {};

  try {
    const res = await webServerApi.refreshAttachmentUrls({
      upload_ids: ids
    });
    if (res?.code !== 0 || !res.data?.items) {
      failed = true;
    } else {
      resolved = res.data.items as Record<string, RefreshAttachmentResult>;
      refreshed = Object.keys(resolved).length;

      for (const [uploadId, info] of Object.entries(resolved)) {
        setRefreshedAttachmentWeb(uploadId, info);
      }

      if (hasDesktopMediaCache()) {
        for (const [uploadId, info] of Object.entries(resolved)) {
          try {
            await window.electronAPI.updateMessageAttachment({
              upload_id: uploadId,
              url: info.url,
              thumb_url: info.thumb_url,
              preview_url: info.preview_url,
              thumb_status: info.thumb_status
            });
          } catch (err) {
            attLog.warn("refreshAttachmentUrls persist failed", {
              uploadId,
              err
            });
          }
        }
      }
    }
  } catch (err) {
    failed = true;
    attLog.warn("refreshAttachmentUrls error", {
      requested: ids.length,
      err: err instanceof Error ? err.message : String(err)
    });
  } finally {
    for (const entry of entries) {
      const info = resolved[entry.uploadId];
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

export async function refreshAttachmentUrlsAndPersist(
  uploadIds: string[]
): Promise<Record<string, RefreshAttachmentResult>> {
  const ids = Array.from(
    new Set(uploadIds.map(id => String(id || "").trim()).filter(Boolean))
  );
  if (ids.length === 0) return {};

  const waiters: Array<Promise<[string, RefreshAttachmentResult | undefined]>> =
    [];

  for (const uploadId of ids) {
    waiters.push(
      new Promise(resolve => {
        const resolver = (info: RefreshAttachmentResult | undefined) => {
          resolve([uploadId, info]);
        };
        const existing = pending.get(uploadId);
        if (existing) {
          existing.waiters.push(resolver);
        } else {
          pending.set(uploadId, { uploadId, waiters: [resolver] });
        }
      })
    );
  }

  scheduleFlush();

  const settled = await Promise.all(waiters);
  const result: Record<string, RefreshAttachmentResult> = {};
  for (const [id, info] of settled) {
    if (info) result[id] = info;
  }
  return result;
}
