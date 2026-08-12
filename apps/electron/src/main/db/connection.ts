import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { app } from "electron";
import { MigrationRunner } from "../migration";
import { store } from "..";
import log from "../../utils/log";
import { getAccountDbRoot, getAccountRoot } from "../runtime-paths";

let db: InstanceType<typeof Database> | null = null;
let currentDbPath: string | null = null;
let currentUserId: number | null = null;

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getDbBaseDir() {
  // userData 已经在 main 入口按实例切换过，这里统一读取即可：
  // - 生产 / dev default 实例：系统默认 userData 根目录。
  // - dev 非 default 实例：<defaultUserData>/instances/<instanceId>。
  return app.getPath("userData");
}

/**
 * 返回当前已激活用户数据库文件的绝对路径，未登录时返回 null。
 * 「数据存储」面板用它来展示真实的 DB 文件位置。
 */
export function getCurrentUserDbPath(): string | null {
  return currentDbPath;
}

/** 返回当前已激活的用户 ID，未登录时返回 null。 */
export function getCurrentUserId(): number | null {
  return currentUserId;
}

/**
 * 返回当前用户数据库基目录（始终为当前实例的 `userData`）。
 * 「数据存储」面板的「打开路径」白名单需要同时允许它。
 */
export function getCurrentDbBaseDir(): string {
  return getDbBaseDir();
}

export function getDb(): InstanceType<typeof Database> {
  if (!db) {
    throw new Error("Database not initialized. Please login first.");
  }
  return db;
}

/**
 * 冷启动尝试打开上次登录账号的 DB。
 *
 * 失败场景（典型为 Windows 杀软占用 / 上次未正常退出残留 -wal / -shm 锁）
 * 我们做带退避的 N 次重试。**不**广播 / 不弹 dialog —— 该决定交给
 * `index.ts`，它知道窗口何时就绪、是否需要让用户选「重试 / 切换账号 /
 * 退出」。这里不能再静默吞错让上层以为「未登录」，否则 renderer 落到
 * 登录页，用户感知为「账号丢失」。
 *
 * 返回 `{ ok: true }` 代表无需登录或初始化成功；`{ ok: false, userId,
 * message }` 代表「上一次登录用户 DB 打不开」，调用方应触发兜底 UI。
 */
export async function tryInitLastLoginUserDb(): Promise<
  { ok: true } | { ok: false; userId: number; message: string }
> {
  const lastUserId = store.get("last-login-user") as number | undefined;
  if (!lastUserId) {
    return { ok: true };
  }

  const delaysMs = [0, 200, 500, 1000];
  let lastError: unknown = null;
  for (let attempt = 0; attempt < delaysMs.length; attempt++) {
    const delay = delaysMs[attempt];
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    try {
      initDatabaseForUser(lastUserId);
      return { ok: true };
    } catch (err) {
      lastError = err;
      log.error("tryInitLastLoginUserDb attempt failed", {
        attempt,
        userId: lastUserId,
        err
      });
    }
  }

  const message =
    lastError instanceof Error ? lastError.message : String(lastError ?? "");
  return { ok: false, userId: lastUserId, message };
}

/**
 * 由 `db:init-failed` 弹窗中的「重试」按钮触发：再走一次完整的
 * `tryInitLastLoginUserDb`。返回值约定见 IPC `db:retry-init` 注释。
 */
export async function retryInitLastLoginUserDb(): Promise<{
  ok: boolean;
  message?: string;
}> {
  const lastUserId = store.get("last-login-user") as number | undefined;
  if (!lastUserId) {
    return { ok: true };
  }
  try {
    initDatabaseForUser(lastUserId);
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err ?? "");
    log.error("retryInitLastLoginUserDb failed", { userId: lastUserId, err });
    return { ok: false, message };
  }
}

/** 关闭当前 DB 句柄（用于退出登录 / 切换账号），不删除磁盘文件。 */
export function closeCurrentDatabase() {
  if (db) {
    try {
      db.close();
    } catch (err) {
      log.error("close db failed", err);
    }
    db = null;
  }
  currentDbPath = null;
  currentUserId = null;
}

/** 删除某个用户的整个账号目录 `<userData>/users/<uid>`（wipeLocalData=true 时使用）。 */
export function dropAccountDataDir(userId: number) {
  const dir = getAccountRoot(userId);
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (err) {
    log.error("dropAccountDataDir failed", { userId, err });
  }
}

function initDatabaseForUser(userId: number) {
  closeCurrentDatabase();
  store.set("last-login-user", userId);

  const accountDbDir = getAccountDbRoot(userId);
  ensureDir(accountDbDir);
  const userDbPath = path.join(accountDbDir, "im.db");

  let handle: InstanceType<typeof Database> | null = null;
  try {
    handle = new Database(userDbPath);
    // WAL + 较长的 busy_timeout 显著降低杀软扫描 / 上一次未优雅关闭遗留
    // -wal/-shm 时的 SQLITE_BUSY 概率；synchronous=NORMAL 在 WAL 模式
    // 下是公认的安全取舍（写入更快，崩溃只会丢最近未刷盘的事务）。
    try {
      handle.pragma("journal_mode = WAL");
      handle.pragma("busy_timeout = 5000");
      handle.pragma("synchronous = NORMAL");
    } catch (pragmaErr) {
      log.warn("apply sqlite pragmas failed", { userId, err: pragmaErr });
    }
    db = handle;
    currentDbPath = userDbPath;
    currentUserId = userId;
    initializeDatabase(userDbPath);
  } catch (err) {
    // 任何阶段失败都还原到「未登录」干净状态，避免脏 db 句柄 / 脏 uid
    // 泄漏给上层。保留 last-login-user 让用户决定「重试 / 清除并重新登录」。
    try {
      handle?.close();
    } catch (closeErr) {
      log.error("close db after init failure", closeErr);
    }
    db = null;
    currentDbPath = null;
    currentUserId = null;
    throw err;
  }
}

/** 由 index.ts 在 login-success / wipeLocalData 重置之后调用。 */
export function initDatabaseForUserPublic(userId: number) {
  initDatabaseForUser(userId);
}

export function initializeDatabase(dbPath: string) {
  log.debug("Initializing database at:", dbPath);
  const runner = new MigrationRunner(dbPath);
  runner.up();
  log.debug("Database initialized");
}
