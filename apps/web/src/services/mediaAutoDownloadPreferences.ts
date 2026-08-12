/**
 * 渲染端薄封装：通过 preload 的 IPC 读写「媒体自动下载策略」。
 *
 * 主进程持久化在 `<userData>/preferences/<safeUsername>/media-auto-download.json`，
 * 并通过 `prefs:media-auto-download-changed` 跨窗口广播，本模块负责：
 *   - 内存缓存（按 username 维度）
 *   - 单飞 fetch（同一 username 同时只发一次 IPC）
 *   - React Hook：`useMediaAutoDownloadPreferences(username)`
 *   - 同步访问器：`getCachedMediaAutoDownloadPreferences(username)`，供消息渲染时
 *     做下载门控；初始未命中时返回内置默认（行为零退化）。
 */
import { useEffect, useState } from "react";
import {
  DEFAULT_MEDIA_AUTO_DOWNLOAD_PREFERENCES,
  normalizeMediaAutoDownloadPreferences,
  type MediaAutoDownloadPolicy,
  type MediaAutoDownloadPreferences,
  type MediaCategory
} from "@mushroom/shared";

type Listener = (prefs: MediaAutoDownloadPreferences) => void;

interface PreferenceEntry {
  prefs: MediaAutoDownloadPreferences;
  loaded: boolean;
  pending: Promise<MediaAutoDownloadPreferences> | null;
  listeners: Set<Listener>;
}

const cache = new Map<string, PreferenceEntry>();
let broadcastSubscribed = false;

function entryFor(key: string): PreferenceEntry {
  let entry = cache.get(key);
  if (!entry) {
    entry = {
      prefs: { ...DEFAULT_MEDIA_AUTO_DOWNLOAD_PREFERENCES },
      loaded: false,
      pending: null,
      listeners: new Set()
    };
    cache.set(key, entry);
  }
  return entry;
}

function keyOf(username: string | null | undefined): string {
  return username && username.length > 0 ? username : "__default__";
}

function ensureBroadcastSubscribed() {
  if (broadcastSubscribed) return;
  const api = (typeof window !== "undefined" && window.electronAPI) || null;
  if (!api?.onMediaAutoDownloadPreferencesChanged) return;
  api.onMediaAutoDownloadPreferencesChanged(({ username, preferences }) => {
    const key = keyOf(username);
    const entry = entryFor(key);
    entry.prefs = normalizeMediaAutoDownloadPreferences(preferences);
    entry.loaded = true;
    for (const cb of entry.listeners) cb(entry.prefs);
  });
  broadcastSubscribed = true;
}

function hasIpc(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.electronAPI?.getMediaAutoDownloadPreferences === "function"
  );
}

export function getCachedMediaAutoDownloadPreferences(
  username: string | null | undefined
): MediaAutoDownloadPreferences {
  return entryFor(keyOf(username)).prefs;
}

export async function loadMediaAutoDownloadPreferences(
  username: string | null | undefined
): Promise<MediaAutoDownloadPreferences> {
  const key = keyOf(username);
  const entry = entryFor(key);
  if (!hasIpc()) {
    entry.loaded = true;
    return entry.prefs;
  }
  if (entry.loaded && !entry.pending) return entry.prefs;
  if (entry.pending) return entry.pending;

  ensureBroadcastSubscribed();

  entry.pending = (async () => {
    try {
      const raw = await window.electronAPI.getMediaAutoDownloadPreferences(
        username ?? null
      );
      entry.prefs = normalizeMediaAutoDownloadPreferences(raw);
    } catch {
      // 读失败时保留默认值即可
    } finally {
      entry.loaded = true;
      entry.pending = null;
      for (const cb of entry.listeners) cb(entry.prefs);
    }
    return entry.prefs;
  })();

  return entry.pending;
}

export async function setMediaAutoDownloadPolicy(
  username: string | null | undefined,
  category: MediaCategory,
  policy: MediaAutoDownloadPolicy
): Promise<MediaAutoDownloadPreferences> {
  const key = keyOf(username);
  const entry = entryFor(key);
  if (hasIpc()) {
    const raw = await window.electronAPI.setMediaAutoDownloadPolicy(
      username ?? null,
      category,
      policy
    );
    entry.prefs = normalizeMediaAutoDownloadPreferences(raw);
  } else {
    entry.prefs = { ...entry.prefs, [category]: policy };
  }
  entry.loaded = true;
  for (const cb of entry.listeners) cb(entry.prefs);
  return entry.prefs;
}

export function useMediaAutoDownloadPreferences(
  username: string | null | undefined
) {
  const key = keyOf(username);
  const [prefs, setPrefs] = useState<MediaAutoDownloadPreferences>(
    () => entryFor(key).prefs
  );
  const [loading, setLoading] = useState<boolean>(() => !entryFor(key).loaded);

  useEffect(() => {
    let cancelled = false;
    const entry = entryFor(key);
    const listener: Listener = next => {
      if (cancelled) return;
      setPrefs(next);
    };
    entry.listeners.add(listener);
    setPrefs(entry.prefs);
    setLoading(!entry.loaded);

    if (!entry.loaded) {
      void loadMediaAutoDownloadPreferences(username).finally(() => {
        if (!cancelled) setLoading(false);
      });
    }

    return () => {
      cancelled = true;
      entry.listeners.delete(listener);
    };
  }, [key, username]);

  return { preferences: prefs, loading } as const;
}
