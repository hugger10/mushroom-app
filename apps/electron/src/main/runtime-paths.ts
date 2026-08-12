import { app } from "electron";
import path from "node:path";

/**
 * 解析当前运行实例 ID。
 * - 开发环境：依次读取 `--instance=xxx` CLI 参数、`MUSHROOM_APP_INSTANCE` 环境变量；
 *   未提供时回落到 "default"。非法字符会被替换为 `_`。
 * - 生产环境（packaged）：强制返回 "default"，避免用户通过参数/环境变量绕开单实例限制。
 */
export function getInstanceId(): string {
  if (app.isPackaged) {
    return "default";
  }

  const cliArg = process.argv.find(arg => arg.startsWith("--instance="));
  const raw =
    cliArg?.slice("--instance=".length) || process.env.MUSHROOM_APP_INSTANCE;
  const normalized = raw?.trim();
  if (!normalized) {
    return "default";
  }
  return normalized.replace(/[^a-zA-Z0-9-_]/g, "_");
}

/**
 * 在 `app.whenReady` 之前调用，将 `userData` 切换到按实例隔离的子目录：
 *   - default 实例：保持系统默认 `userData` 根目录不变。
 *   - 其它实例：`<defaultUserData>/instances/<instanceId>`。
 *
 * 切换之后 Electron 自动派生的 `logs` / `sessionData` / `Cache` 等都会跟随，
 * 业务层只需统一通过 `app.getPath("userData")` 读取实际路径。
 */
export function applyInstanceUserDataPath(): {
  instanceId: string;
  userDataPath: string;
} {
  const instanceId = getInstanceId();
  const baseUserData = app.getPath("userData");
  const nextUserData =
    instanceId === "default"
      ? baseUserData
      : path.join(baseUserData, "instances", instanceId);

  if (nextUserData !== baseUserData) {
    app.setPath("userData", nextUserData);
  }

  return { instanceId, userDataPath: nextUserData };
}

/** 匿名（未登录）窗口使用的 partition，不持久化敏感数据。 */
export const ANON_PARTITION = "persist:anon";

/**
 * 返回某个用户的 partition 名称，用于 BrowserWindow.webPreferences.partition。
 * Electron 会自动把它落到 `<userData>/Partitions/persist%3Auser-<uid>/`。
 */
export function getUserPartitionName(uid: number | string): string {
  return `persist:user-${uid}`;
}

/**
 * 返回某个用户的 partition 在磁盘上的目录（Electron 会把冒号 URL-encode 成 %3A）。
 * 用于 wipeLocalData=true 时手动 `fs.rm` 兜底清理。
 */
export function getUserPartitionDir(uid: number | string): string {
  const userData = app.getPath("userData");
  return path.join(userData, "Partitions", `persist%3Auser-${uid}`);
}

/** `<userData>/users` 根目录，所有按账号物理隔离的数据都放在它下面。 */
export function getUsersRoot(): string {
  return path.join(app.getPath("userData"), "users");
}

/** 单个账号的根目录 `<userData>/users/<uid>`。 */
export function getAccountRoot(uid: number | string): string {
  return path.join(getUsersRoot(), String(uid));
}

/** 账号级数据库目录 `<userData>/users/<uid>/db`。 */
export function getAccountDbRoot(uid: number | string): string {
  return path.join(getAccountRoot(uid), "db");
}

/** 账号级媒体缓存目录 `<userData>/users/<uid>/media`。 */
export function getAccountMediaRoot(uid: number | string): string {
  return path.join(getAccountRoot(uid), "media");
}

/** 账号级 outbox 落盘目录 `<userData>/users/<uid>/outbox`。 */
export function getAccountOutboxRoot(uid: number | string): string {
  return path.join(getAccountRoot(uid), "outbox");
}

/** 账号级偏好目录 `<userData>/users/<uid>/preferences`。 */
export function getAccountPreferencesRoot(uid: number | string): string {
  return path.join(getAccountRoot(uid), "preferences");
}
