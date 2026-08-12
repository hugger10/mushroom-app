import { useCallback, useEffect, useState } from "react";
import * as RNFS from "react-native-fs";
import {
  getMediaCacheRoot,
  getMobileOutboxRoot
} from "../../platform/media-cache";

export type StorageUsageBreakdown = {
  /** Real bytes scanned from the caches directory. */
  cacheBytes: number;
  /** Placeholder for future media tracking; current build always returns 0. */
  photosBytes: number;
  audioBytes: number;
  videosBytes: number;
  documentsBytes: number;
  /** Anything else we cannot attribute. Always 0 in the current build. */
  otherBytes: number;
  /** Sum of every category. */
  totalBytes: number;
  /** Free space available on the device, in bytes. May be null on failure. */
  freeBytes: number | null;
  /** Total device capacity in bytes. May be null on failure. */
  totalDeviceBytes: number | null;
};

const EMPTY_BREAKDOWN: StorageUsageBreakdown = {
  cacheBytes: 0,
  photosBytes: 0,
  audioBytes: 0,
  videosBytes: 0,
  documentsBytes: 0,
  otherBytes: 0,
  totalBytes: 0,
  freeBytes: null,
  totalDeviceBytes: null
};

async function safeDirectorySize(dirPath: string): Promise<number> {
  try {
    const exists = await RNFS.exists(dirPath);
    if (!exists) {
      return 0;
    }
    const items = await RNFS.readDir(dirPath);
    let total = 0;
    for (const item of items) {
      if (item.isFile()) {
        total += Number(item.size) || 0;
      } else if (item.isDirectory()) {
        total += await safeDirectorySize(item.path);
      }
    }
    return total;
  } catch {
    return 0;
  }
}

async function readFreeSpace(): Promise<{
  freeBytes: number | null;
  totalDeviceBytes: number | null;
}> {
  try {
    const info = await RNFS.getFSInfo();
    return {
      freeBytes: typeof info.freeSpace === "number" ? info.freeSpace : null,
      totalDeviceBytes:
        typeof info.totalSpace === "number" ? info.totalSpace : null
    };
  } catch {
    return { freeBytes: null, totalDeviceBytes: null };
  }
}

async function scanStorage(): Promise<StorageUsageBreakdown> {
  // Per-account isolation (docs/account.md §六): each user has its own
  // Caches/users/<uid>/media tree plus AppSupport/users/<uid>/outbox.
  // Storage usage / cleanup must stay scoped to the active account so
  // signing out and back into a different user never appears to "leak"
  // bytes across identities.
  const [mediaBytes, outboxBytes, fs] = await Promise.all([
    safeDirectorySize(getMediaCacheRoot()),
    safeDirectorySize(getMobileOutboxRoot()),
    readFreeSpace()
  ]);
  const cacheBytes = mediaBytes + outboxBytes;
  return {
    cacheBytes,
    photosBytes: 0,
    audioBytes: 0,
    videosBytes: 0,
    documentsBytes: 0,
    otherBytes: 0,
    totalBytes: cacheBytes,
    freeBytes: fs.freeBytes,
    totalDeviceBytes: fs.totalDeviceBytes
  };
}

async function clearDirectoryContents(dirPath: string): Promise<number> {
  let cleared = 0;
  try {
    const exists = await RNFS.exists(dirPath);
    if (!exists) {
      return 0;
    }
    const items = await RNFS.readDir(dirPath);
    for (const item of items) {
      const size = item.isFile()
        ? Number(item.size) || 0
        : await safeDirectorySize(item.path);
      try {
        await RNFS.unlink(item.path);
        cleared += size;
      } catch {
        // ignore individual unlink failures
      }
    }
  } catch {
    // swallow – we still return the bytes we managed to clear
  }
  return cleared;
}

export async function clearMobileCacheDirectory(): Promise<number> {
  // Only clear the media cache (reproducible from server). The outbox
  // contains attachments still pending upload and must NOT be wiped
  // from the "clear cache" affordance.
  return clearDirectoryContents(getMediaCacheRoot());
}

export function useStorageUsage() {
  const [usage, setUsage] = useState<StorageUsageBreakdown>(EMPTY_BREAKDOWN);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await scanStorage();
      setUsage(next);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next = await scanStorage();
      if (!cancelled) {
        setUsage(next);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { usage, loading, refresh };
}

export { formatStorageSize } from "@mushroom/shared";
