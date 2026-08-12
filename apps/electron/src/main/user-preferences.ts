/**
 * 媒体自动下载偏好 — 主进程持久化。
 *
 * 数据组织（账号物理隔离）：
 *   <userData>/users/<uid>/preferences/media-auto-download.json
 *
 * 未登录态走 `<userData>/users/_anon/preferences/`。Renderer 仍然按
 * username 调用 API（保持兼容），但主进程统一用「当前活跃 uid」决定路径，
 * 不再使用渲染层传入的 username 拼路径。
 *
 * 写入路径同时：
 *   1. 更新内存缓存（按 user 维度）
 *   2. 写盘（同步，文件极小）
 *   3. 通过 `prefs:media-auto-download-changed` 事件向所有 webContents
 *      广播 `{ username, preferences }`，让其它窗口立即生效。
 */

import fs from "node:fs";
import path from "node:path";
import { BrowserWindow, ipcMain } from "electron";
import {
  DEFAULT_MEDIA_AUTO_DOWNLOAD_PREFERENCES,
  isMediaAutoDownloadPolicy,
  isMediaCategory,
  normalizeMediaAutoDownloadPreferences,
  type MediaAutoDownloadPolicy,
  type MediaAutoDownloadPreferences,
  type MediaCategory
} from "@mushroom/shared";
import log from "../utils/log";
import { getCurrentUserId } from "./database";
import { getAccountPreferencesRoot } from "./runtime-paths";

const PREFS_FILE_NAME = "media-auto-download.json";
const CHANGE_EVENT = "prefs:media-auto-download-changed";

const cache = new Map<string, MediaAutoDownloadPreferences>();

const ANON_UID = "_anon";

function currentAccountSegment(): string {
  const uid = getCurrentUserId();
  return uid == null ? ANON_UID : String(uid);
}

function getPrefsDir(): string {
  return getAccountPreferencesRoot(currentAccountSegment());
}

function getPrefsFilePath(): string {
  return path.join(getPrefsDir(), PREFS_FILE_NAME);
}

function readFromDisk(): MediaAutoDownloadPreferences {
  const filePath = getPrefsFilePath();
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return normalizeMediaAutoDownloadPreferences(parsed);
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      (error as { code?: string }).code === "ENOENT"
    ) {
      return { ...DEFAULT_MEDIA_AUTO_DOWNLOAD_PREFERENCES };
    }
    log.warn("Failed to read media auto-download prefs, falling back", {
      filePath,
      error
    });
    return { ...DEFAULT_MEDIA_AUTO_DOWNLOAD_PREFERENCES };
  }
}

function writeToDisk(prefs: MediaAutoDownloadPreferences) {
  const dir = getPrefsDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, PREFS_FILE_NAME),
    JSON.stringify(prefs, null, 2),
    "utf8"
  );
}

export function readMediaAutoDownloadPrefs(
  _username?: string | null | undefined
): MediaAutoDownloadPreferences {
  const key = currentAccountSegment();
  const cached = cache.get(key);
  if (cached) {
    return { ...cached };
  }
  const loaded = readFromDisk();
  cache.set(key, loaded);
  return { ...loaded };
}

export function writeMediaAutoDownloadPolicy(
  username: string | null | undefined,
  category: MediaCategory,
  policy: MediaAutoDownloadPolicy
): MediaAutoDownloadPreferences {
  const key = currentAccountSegment();
  const current = readMediaAutoDownloadPrefs(username);
  if (current[category] === policy) {
    return current;
  }
  const next: MediaAutoDownloadPreferences = { ...current, [category]: policy };
  cache.set(key, next);
  try {
    writeToDisk(next);
  } catch (error) {
    log.error("Failed to persist media auto-download prefs", { error });
  }
  broadcastChange(username, next);
  return { ...next };
}

function broadcastChange(
  username: string | null | undefined,
  prefs: MediaAutoDownloadPreferences
) {
  const payload = {
    username: (username ?? "").trim() || null,
    preferences: prefs
  };
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(CHANGE_EVENT, payload);
    }
  }
}

export const MEDIA_AUTO_DOWNLOAD_CHANGE_CHANNEL = CHANGE_EVENT;

/** 退出登录时清理缓存，避免下次切账号读到旧值。 */
export function resetUserPreferencesCache() {
  cache.clear();
}

export function setupUserPreferencesIpcHandlers() {
  ipcMain.handle(
    "prefs:get-media-auto-download",
    (_event, username: string | null | undefined) => {
      return readMediaAutoDownloadPrefs(username);
    }
  );

  ipcMain.handle(
    "prefs:set-media-auto-download",
    (
      _event,
      input: {
        username?: string | null;
        category: unknown;
        policy: unknown;
      }
    ) => {
      if (!isMediaCategory(input?.category)) {
        throw new Error("Invalid media category");
      }
      if (!isMediaAutoDownloadPolicy(input?.policy)) {
        throw new Error("Invalid media auto-download policy");
      }
      return writeMediaAutoDownloadPolicy(
        input.username ?? null,
        input.category,
        input.policy
      );
    }
  );
}
