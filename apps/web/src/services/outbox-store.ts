/**
 * Web / Electron 渲染进程的 outbox 客户端。
 *
 * 自动选择实现：
 *   - Electron 渲染进程（`window.electronAPI.outboxPut` 存在）→ 走主进程 IPC
 *     ，把原文件 / 缩略图落到 `<userData>/users/<uid>/outbox/...`，ref 是
 *     绝对路径字符串。
 *   - 纯浏览器（无 electronAPI）→ 走 IndexedDB（`mushroom-outbox` / `attachments`）
 *     ，带 500MB LRU 上限；ref 形如 `idb:<uid>:<clientMessageId>:<slot>`。
 *
 * 上层（useChatOutgoing）只面向 `OutboxClient` 接口，不关心具体实现。失败
 * 一律 best-effort：写失败返回空字符串、读失败返回 null。
 */

import log from "../utils/log";

const outboxLog = log.scope("outbox");

export type OutboxSlot = "source" | "preview";

export interface OutboxPutInput {
  uid: number | string;
  clientMessageId: string;
  slot: OutboxSlot;
  /** 必须是 Blob / File / ArrayBuffer / Uint8Array。 */
  data: Blob | ArrayBuffer | Uint8Array;
  extension?: string;
  mimeType?: string;
}

export interface OutboxReadResult {
  /** 浏览器/IPC 都返回 Blob 给 UI 直接 `URL.createObjectURL`。 */
  blob: Blob;
  size: number;
  mimeType?: string;
}

export interface OutboxClient {
  put(input: OutboxPutInput): Promise<string>;
  get(ref: string): Promise<OutboxReadResult | null>;
  delete(ref: string): Promise<void>;
  /** 启动时调用：删除当前 uid 下不在 activeRefs 中的所有项。 */
  sweep(input: {
    uid: number | string;
    activeRefs: ReadonlySet<string>;
  }): Promise<void>;
}

// ---------------------------------------------------------------------------
// Electron IPC 实现
// ---------------------------------------------------------------------------

class ElectronOutboxClient implements OutboxClient {
  async put(input: OutboxPutInput): Promise<string> {
    try {
      const buf = await toArrayBuffer(input.data);
      // 注意：刻意不传 `uid` —— 主进程通过 `getCurrentUserId()` 解析当前账户，
      // 避免渲染端伪造 uid 写入其他账户的 outbox 目录。
      const ref = await window.electronAPI.outboxPut({
        clientMessageId: input.clientMessageId,
        slot: input.slot,
        extension: input.extension,
        mimeType: input.mimeType,
        data: buf
      });
      return ref || "";
    } catch (err) {
      outboxLog.warn("electron outbox put failed", err);
      return "";
    }
  }

  async get(ref: string): Promise<OutboxReadResult | null> {
    if (!ref) return null;
    try {
      const result = await window.electronAPI.outboxGet(ref);
      if (!result) return null;
      return {
        blob: new Blob([result.data], { type: result.mimeType || "" }),
        size: result.size,
        mimeType: result.mimeType
      };
    } catch (err) {
      outboxLog.warn("electron outbox get failed", err);
      return null;
    }
  }

  async delete(ref: string): Promise<void> {
    if (!ref) return;
    try {
      await window.electronAPI.outboxDelete(ref);
    } catch (err) {
      outboxLog.warn("electron outbox delete failed", err);
    }
  }

  async sweep(input: {
    uid: number | string;
    activeRefs: ReadonlySet<string>;
  }): Promise<void> {
    try {
      // 同 put：uid 由主进程解析。
      await window.electronAPI.outboxSweep({
        activeRefs: Array.from(input.activeRefs)
      });
    } catch (err) {
      outboxLog.warn("electron outbox sweep failed", err);
    }
  }
}

// ---------------------------------------------------------------------------
// IndexedDB 实现（带 500MB LRU）
// ---------------------------------------------------------------------------

const DB_NAME = "mushroom-outbox";
const DB_VERSION = 1;
const STORE = "attachments";
const MAX_TOTAL_BYTES = 500 * 1024 * 1024;

interface OutboxRow {
  key: string; // primary key = ref
  uid: string;
  clientMessageId: string;
  slot: OutboxSlot;
  blob: Blob;
  size: number;
  mimeType: string;
  createdAt: number;
  lastAccessedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "key" });
        store.createIndex("by_uid", "uid");
        store.createIndex("by_lastAccessedAt", "lastAccessedAt");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => Promise<T> | T
): Promise<T> {
  return openDb().then(
    db =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const store = transaction.objectStore(STORE);
        let result: T | undefined;
        Promise.resolve(run(store))
          .then(value => {
            result = value;
          })
          .catch(reject);
        transaction.oncomplete = () => resolve(result as T);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      })
  );
}

function makeRef(
  uid: number | string,
  clientMessageId: string,
  slot: OutboxSlot
): string {
  return `idb:${uid}:${clientMessageId}:${slot}`;
}

class IndexedDbOutboxClient implements OutboxClient {
  async put(input: OutboxPutInput): Promise<string> {
    try {
      const blob = await toBlob(input.data, input.mimeType);
      const ref = makeRef(input.uid, input.clientMessageId, input.slot);
      const now = Date.now();
      const row: OutboxRow = {
        key: ref,
        uid: String(input.uid),
        clientMessageId: input.clientMessageId,
        slot: input.slot,
        blob,
        size: blob.size,
        mimeType: blob.type || input.mimeType || "",
        createdAt: now,
        lastAccessedAt: now
      };
      await tx("readwrite", store => {
        store.put(row);
      });
      // LRU 兜底（best-effort，不阻塞写入返回）。
      void this.enforceQuota();
      return ref;
    } catch (err) {
      outboxLog.warn("idb outbox put failed", err);
      return "";
    }
  }

  async get(ref: string): Promise<OutboxReadResult | null> {
    if (!ref) return null;
    try {
      return await tx("readwrite", store => {
        return new Promise<OutboxReadResult | null>((resolve, reject) => {
          const req = store.get(ref);
          req.onsuccess = () => {
            const row = req.result as OutboxRow | undefined;
            if (!row) {
              resolve(null);
              return;
            }
            row.lastAccessedAt = Date.now();
            store.put(row);
            resolve({
              blob: row.blob,
              size: row.size,
              mimeType: row.mimeType
            });
          };
          req.onerror = () => reject(req.error);
        });
      });
    } catch (err) {
      outboxLog.warn("idb outbox get failed", err);
      return null;
    }
  }

  async delete(ref: string): Promise<void> {
    if (!ref) return;
    try {
      await tx("readwrite", store => {
        store.delete(ref);
      });
    } catch (err) {
      outboxLog.warn("idb outbox delete failed", err);
    }
  }

  async sweep(input: {
    uid: number | string;
    activeRefs: ReadonlySet<string>;
  }): Promise<void> {
    const uidStr = String(input.uid);
    try {
      await tx("readwrite", store => {
        return new Promise<void>((resolve, reject) => {
          const idx = store.index("by_uid");
          const req = idx.openCursor(IDBKeyRange.only(uidStr));
          req.onsuccess = () => {
            const cursor = req.result;
            if (!cursor) {
              resolve();
              return;
            }
            const row = cursor.value as OutboxRow;
            if (!input.activeRefs.has(row.key)) {
              cursor.delete();
            }
            cursor.continue();
          };
          req.onerror = () => reject(req.error);
        });
      });
    } catch (err) {
      outboxLog.warn("idb outbox sweep failed", err);
    }
  }

  /** LRU：按 lastAccessedAt 升序删，直到总大小不超过 MAX_TOTAL_BYTES。 */
  private async enforceQuota(): Promise<void> {
    try {
      await tx("readwrite", store => {
        return new Promise<void>((resolve, reject) => {
          let total = 0;
          const rows: OutboxRow[] = [];
          const req = store.openCursor();
          req.onsuccess = () => {
            const cursor = req.result;
            if (cursor) {
              const row = cursor.value as OutboxRow;
              total += row.size;
              rows.push(row);
              cursor.continue();
              return;
            }
            if (total <= MAX_TOTAL_BYTES) {
              resolve();
              return;
            }
            rows.sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);
            let trimmed = total;
            for (const row of rows) {
              if (trimmed <= MAX_TOTAL_BYTES) break;
              store.delete(row.key);
              trimmed -= row.size;
            }
            resolve();
          };
          req.onerror = () => reject(req.error);
        });
      });
    } catch (err) {
      outboxLog.warn("idb outbox enforceQuota failed", err);
    }
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

async function toArrayBuffer(
  data: Blob | ArrayBuffer | Uint8Array
): Promise<ArrayBuffer> {
  if (data instanceof ArrayBuffer) return data;
  if (data instanceof Uint8Array) {
    return data.buffer.slice(
      data.byteOffset,
      data.byteOffset + data.byteLength
    ) as ArrayBuffer;
  }
  return await data.arrayBuffer();
}

async function toBlob(
  data: Blob | ArrayBuffer | Uint8Array,
  mimeType?: string
): Promise<Blob> {
  if (data instanceof Blob) return data;
  if (data instanceof Uint8Array) {
    return new Blob([data], { type: mimeType || "" });
  }
  return new Blob([data], { type: mimeType || "" });
}

// ---------------------------------------------------------------------------
// singleton
// ---------------------------------------------------------------------------

let cached: OutboxClient | null = null;

export function getOutboxClient(): OutboxClient {
  if (cached) return cached;
  const hasElectron =
    typeof window !== "undefined" &&
    typeof (window as unknown as { electronAPI?: { outboxPut?: unknown } })
      .electronAPI?.outboxPut === "function";
  cached = hasElectron
    ? new ElectronOutboxClient()
    : new IndexedDbOutboxClient();
  return cached;
}
