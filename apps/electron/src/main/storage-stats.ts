/**
 * 「数据存储」面板所需的应用级统计 IPC：
 *   - storage:get-app-stats → DB 大小 / 日志目录大小 / userData / mediaRoot 路径
 *   - storage:open-path     → 调用 shell.openPath 打开目录或文件
 */

import fsp from "node:fs/promises";
import path from "node:path";
import { app, ipcMain, shell } from "electron";
import { getMediaCacheRoot } from "./media-cache-core";
import {
  getCurrentDbBaseDir,
  getCurrentUserDbPath,
  getCurrentUserId
} from "./database";
import { getAccountRoot, getUsersRoot } from "./runtime-paths";
import log from "../utils/log";

async function statSize(target: string): Promise<number> {
  try {
    const stats = await fsp.stat(target);
    return stats.isFile() ? stats.size : 0;
  } catch {
    return 0;
  }
}

async function dirSize(dir: string): Promise<number> {
  let total = 0;
  let entries: string[];
  try {
    entries = await fsp.readdir(dir);
  } catch {
    return 0;
  }
  for (const name of entries) {
    const fullPath = path.join(dir, name);
    let stats;
    try {
      stats = await fsp.stat(fullPath);
    } catch {
      continue;
    }
    if (stats.isFile()) {
      total += stats.size;
    } else if (stats.isDirectory()) {
      total += await dirSize(fullPath);
    }
  }
  return total;
}

async function readAppStats() {
  const userDataDir = app.getPath("userData");
  const dbPath = getCurrentUserDbPath();
  const logsDir = path.join(userDataDir, "logs");
  const uid = getCurrentUserId();
  const mediaRoot = uid == null ? "" : getMediaCacheRoot(uid);

  const [dbBytes, logsBytes] = await Promise.all([
    dbPath ? statSize(dbPath) : Promise.resolve(0),
    dirSize(logsDir)
  ]);

  return {
    userDataDir,
    mediaRoot,
    dbPath: dbPath ?? "",
    logsDir,
    dbBytes,
    logsBytes
  };
}

function isPathInsideAllowedRoot(target: string): boolean {
  const resolved = path.resolve(target);
  const uid = getCurrentUserId();
  const roots = [
    app.getPath("userData"),
    getCurrentDbBaseDir(),
    getUsersRoot()
  ];
  if (uid != null) {
    roots.push(getAccountRoot(uid));
    roots.push(getMediaCacheRoot(uid));
  }
  for (const root of roots) {
    const rel = path.relative(path.resolve(root), resolved);
    if (rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))) {
      return true;
    }
  }
  return false;
}

export function setupStorageStatsIpcHandlers() {
  ipcMain.handle("storage:get-app-stats", () => readAppStats());

  ipcMain.handle("storage:open-path", async (_event, target: unknown) => {
    if (typeof target !== "string" || !target) {
      throw new Error("Invalid path");
    }
    // 限定为 userData / dbBaseDir / mediaRoot 子树，避免 renderer 借此打开任意路径。
    if (!isPathInsideAllowedRoot(target)) {
      throw new Error("Path is outside allowed roots");
    }
    const error = await shell.openPath(target);
    if (error) {
      log.warn("shell.openPath failed", { target, error });
      throw new Error(error);
    }
    return true;
  });
}
