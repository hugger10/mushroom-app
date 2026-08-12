import Store from "electron-store";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeTheme,
  safeStorage,
  session
} from "electron";
import type { IpcMainInvokeEvent } from "electron";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import isDev from "electron-is-dev";
import { buildDeviceName } from "@mushroom/app-core";
import {
  closeCurrentDatabase,
  dropAccountDataDir,
  getCurrentUserId,
  initDatabaseForUserPublic,
  retryInitLastLoginUserDb,
  setupIpcHandlers,
  tryInitLastLoginUserDb
} from "./database";
import log from "../utils/log";
import { loadEnv } from "../utils/load-env";
import { getOrCreateDeviceId } from "./device";
import {
  ANON_PARTITION,
  applyInstanceUserDataPath,
  getUserPartitionDir,
  getUserPartitionName
} from "./runtime-paths";
import DesktopNotificationManager from "./notification";
import {
  cancelAllMediaDownloads,
  registerMediaCacheProtocolForSession,
  setupMediaCacheIpcHandlers,
  setupMediaCacheProtocol
} from "./media-cache";
import {
  resetUserPreferencesCache,
  setupUserPreferencesIpcHandlers
} from "./user-preferences";
import { setupStorageStatsIpcHandlers } from "./storage-stats";
import { setupOutboxIpcHandlers } from "./outbox";
import {
  closeCallWindow,
  createCallWindow,
  getCallWindow,
  registerCallWindowIpc
} from "./call-window";
import { setToken as setMainHttpClientToken } from "../utils/httpClient";

// 必须在 app.whenReady 之前完成 userData 切换，后续 logs / sessionData 等
// 由 Electron 自动派生的路径才会跟随当前实例。
const { instanceId } = applyInstanceUserDataPath();

const runtimeLog = log.scope("runtime");

function platformDisplayName(platform: NodeJS.Platform): string {
  switch (platform) {
    case "darwin":
      return "macOS";
    case "win32":
      return "Windows";
    case "linux":
      return "Linux";
    default:
      return platform;
  }
}

let mainWindow: BrowserWindow | null = null;
const allowMultipleInstances = !app.isPackaged;
const hasSingleInstanceLock =
  allowMultipleInstances || app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
}

function createWindow(options: { partition: string }) {
  // 自定义协议必须按 partition session 注册，否则 renderer 使用
  // `persist:user-<uid>` / `persist:anon` 时会得到 ERR_UNKNOWN_URL_SCHEME。
  registerMediaCacheProtocolForSession(
    session.fromPartition(options.partition)
  );

  const win = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 700,
    minHeight: 500,
    title: instanceId === "default" ? "Mushroom" : `Mushroom (${instanceId})`,
    icon: path.join(__dirname, "../../resources/icons/icon.png"),
    webPreferences: {
      backgroundThrottling: false,
      preload: path.join(__dirname, "..", "preload", "index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      partition: options.partition
    }
  });
  mainWindow = win;
  win.on("closed", () => {
    if (mainWindow === win) {
      mainWindow = null;
    }
  });

  if (isDev) {
    const rendererUrl = process.env.ELECTRON_RENDERER_URL;
    if (!rendererUrl) {
      throw new Error("Missing ELECTRON_RENDERER_URL in development mode");
    }
    win.loadURL(rendererUrl);
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  }

  DesktopNotificationManager.setMainWindow(win);
  // 来电通知点击优先聚焦通话窗（C4）：注入通话窗访问器，无通话窗时回退主窗。
  DesktopNotificationManager.setCallWindowAccessor(() => getCallWindow());

  // 预热常驻通话窗（§5.6 B1）：随主窗同 partition 建好并隐藏，
  // 来电/发起时仅 show()，消除冷启动白屏。等主窗内容就绪后再建，
  // 避免与主窗争抢首帧资源。
  win.webContents.once("did-finish-load", () => {
    if (win.isDestroyed()) {
      return;
    }
    createCallWindow(options.partition, () => mainWindow);
  });
}

/**
 * 销毁当前主窗口（如果有）并按指定 partition 重建。
 * 用于登录成功 / 退出登录两个场景下的「物理换 session」流程。
 */
function recreateMainWindow(partition: string) {
  // C5：登录/登出销毁主窗时同步销毁通话窗，避免残留与 partition 漂移。
  closeCallWindow();
  const old = mainWindow;
  mainWindow = null;
  if (old && !old.isDestroyed()) {
    old.destroy();
  }
  createWindow({ partition });
}

/** 清空指定 partition 的 cookies / storage / cache，调用方负责再去销毁窗口。 */
async function clearPartitionStorage(partition: string) {
  try {
    const ses = session.fromPartition(partition);
    await ses.clearStorageData();
    await ses.clearCache();
    await ses.clearAuthCache();
  } catch (err) {
    log.warn("clearPartitionStorage failed", { partition, err });
  }
}

/** wipeLocalData=true 时清除 partition 在磁盘上的整个目录。 */
function removePartitionDir(uid: number) {
  const dir = getUserPartitionDir(uid);
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (err) {
    log.warn("removePartitionDir failed", { uid, err });
  }
}

if (hasSingleInstanceLock) {
  app.on("second-instance", () => {
    const targetWindow = mainWindow ?? BrowserWindow.getAllWindows()[0];
    if (!targetWindow) {
      return;
    }
    if (targetWindow.isMinimized()) {
      targetWindow.restore();
    }
    targetWindow.focus();
  });

  app.whenReady().then(async () => {
    loadEnv();
    log.initialize();
    log.info("The application is ready", {
      platform: process.platform,
      arch: process.arch,
      version: app.getVersion(),
      appPath: app.getAppPath(),
      instanceId,
      userDataPath: app.getPath("userData")
    });

    // Renderer → main log bridge. Each record is funneled into the same
    // shared logger instance (scope prefixed with `renderer:`) so it ends
    // up in the daily electron-log file alongside main-process logs.
    ipcMain.on(
      "log:write",
      (
        _event,
        record:
          | {
              level: "debug" | "info" | "warn" | "error";
              scope?: string;
              message: string;
              args: unknown[];
              timestamp: number;
            }
          | null
          | undefined
      ) => {
        if (!record || typeof record !== "object") return;
        const level = record.level;
        if (
          level !== "debug" &&
          level !== "info" &&
          level !== "warn" &&
          level !== "error"
        ) {
          return;
        }
        const scopedLog = log.scope(
          record.scope ? `renderer:${record.scope}` : "renderer"
        );
        const args = Array.isArray(record.args) ? record.args : [];
        scopedLog[level](String(record.message ?? ""), ...args);
      }
    );

    const deviceId = getOrCreateDeviceId();
    ipcMain.handle("get-device-id", () => {
      return deviceId;
    });
    const deviceInfo = {
      deviceId,
      deviceName: buildDeviceName({
        model: os.hostname(),
        osName: platformDisplayName(process.platform),
        osVersion: os.release(),
        fallback: "Electron Desktop"
      }),
      appVersion: app.getVersion()
    };
    ipcMain.handle("get-device-info", () => {
      return deviceInfo;
    });
    DesktopNotificationManager.registerIpcHandlers();
    registerCallWindowIpc(() => mainWindow);

    const initResult = await tryInitLastLoginUserDb();
    setupIpcHandlers();
    setupMediaCacheProtocol();
    setupMediaCacheIpcHandlers();
    setupUserPreferencesIpcHandlers();
    setupStorageStatsIpcHandlers();
    setupOutboxIpcHandlers();

    // 冷启动按上一次的活跃账号选 partition；DB 初始化失败时回落 anon。
    const activeUid = getCurrentUserId();
    const bootPartition =
      activeUid != null ? getUserPartitionName(activeUid) : ANON_PARTITION;
    createWindow({ partition: bootPartition });

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        const uid = getCurrentUserId();
        createWindow({
          partition: uid != null ? getUserPartitionName(uid) : ANON_PARTITION
        });
      }
    });

    if (!initResult.ok) {
      // 必须等窗口创建之后再弹 dialog，否则在 macOS 上 dialog 会无父窗
      // 失焦，在 Windows 上会立即被 createWindow 后续的 focus 抢走。
      await handleDbInitFailure(initResult.userId, initResult.message);
    }
  });
}

/**
 * 弹原生 dialog 让用户选择「重试 / 切换账号 / 退出」。
 *   - 重试：再走一次 retryInitLastLoginUserDb；成功则重建当前 uid 的
 *     窗口（partition 跟随 uid），失败则递归再弹。
 *   - 切换账号：与「未勾选清理」的 logout 行为一致：清当前 uid 的 token、
 *     last-login-user，但保留账号目录与 partition 存储；窗口落到 anon。
 *   - 退出：app.quit()。
 */
async function handleDbInitFailure(
  userId: number,
  message: string
): Promise<void> {
  const parent = mainWindow ?? BrowserWindow.getAllWindows()[0] ?? null;
  // 取第一行作为主提示，完整错误放进 detail（用户可滚动查看）
  const firstLine = message.split("\n")[0];
  const opts: Electron.MessageBoxOptions = {
    type: "error" as const,
    title: "无法打开本地数据",
    message: `无法打开本地数据库：${firstLine}`,
    detail: message.length > firstLine.length ? message : undefined,
    buttons: ["重试", "切换账号", "退出"],
    defaultId: 0,
    cancelId: 2,
    noLink: true
  };

  const { response } = parent
    ? await dialog.showMessageBox(parent, opts)
    : await dialog.showMessageBox(opts);

  if (response === 0) {
    const result = await retryInitLastLoginUserDb();
    if (result.ok) {
      recreateMainWindow(getUserPartitionName(userId));
      return;
    }
    return handleDbInitFailure(userId, result.message ?? "");
  }

  if (response === 1) {
    // 与未勾选清理的 logout 等价：保留账号数据，回到登录页让用户选号。
    try {
      closeCurrentDatabase();
    } catch {
      // best effort
    }
    store.delete(`token-${userId}`);
    store.delete(`refresh-token-${userId}`);
    store.delete("last-login-user");
    setMainHttpClientToken(null);
    recreateMainWindow(ANON_PARTITION);
    return;
  }

  // response === 2：用户主动退出
  app.quit();
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// 应用退出前优雅关闭 better-sqlite3 句柄：未调用 close() 时 SQLite 的
// -wal / -shm 不会被合并回主 db 文件，且 Windows 上残留的 lock 会让下
// 一次冷启动直接撞 SQLITE_BUSY / EBUSY，触发「数据库被占用」对话框。
app.on("before-quit", () => {
  try {
    closeCallWindow();
  } catch (err) {
    log.warn("closeCallWindow on before-quit failed", err);
  }
  try {
    closeCurrentDatabase();
  } catch (err) {
    log.warn("closeCurrentDatabase on before-quit failed", err);
  }
});

const store = new Store({
  name: "config"
});

function encryptToken(text: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(text).toString("base64");
  }
  log.warn("safeStorage not available, storing token as plaintext");
  return text;
}

function decryptToken(stored: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    try {
      return safeStorage.decryptString(Buffer.from(stored, "base64"));
    } catch {
      // Token was likely encrypted with the old scheme — discard it
      log.warn(
        "Failed to decrypt token with safeStorage (possible legacy format), discarding"
      );
      return "";
    }
  }
  log.warn("safeStorage not available, reading token as plaintext");
  return stored;
}

function getLastLoginUser(): number | null {
  return store.get("last-login-user") as number | null;
}

ipcMain.handle("get-system-language", () => {
  return app.getLocale();
});

ipcMain.handle("get-system-theme", () => {
  return nativeTheme.shouldUseDarkColors ? "dark" : "light";
});

ipcMain.handle("get-preferred-language", () => {
  return (store.get("preferred-language") as string | null) ?? null;
});

ipcMain.handle("get-preferred-theme", () => {
  return (store.get("preferred-theme") as string | null) ?? null;
});

ipcMain.handle(
  "set-preferred-language",
  async (_event: IpcMainInvokeEvent, language: string | null) => {
    if (language) {
      store.set("preferred-language", language);
      return;
    }

    store.delete("preferred-language");
  }
);

ipcMain.handle(
  "set-preferred-theme",
  async (_event: IpcMainInvokeEvent, theme: string | null) => {
    if (theme) {
      store.set("preferred-theme", theme);
      return;
    }

    store.delete("preferred-theme");
  }
);

nativeTheme.on("updated", () => {
  const nextTheme = nativeTheme.shouldUseDarkColors ? "dark" : "light";

  for (const windowInstance of BrowserWindow.getAllWindows()) {
    windowInstance.webContents.send("system-theme-changed", nextTheme);
  }
});

ipcMain.handle(
  "save-token",
  async (_event: IpcMainInvokeEvent, token: string) => {
    const userId = getLastLoginUser();
    store.set(`token-${userId}`, encryptToken(token));
  }
);

ipcMain.handle("get-token", async (_event: IpcMainInvokeEvent) => {
  const userId = getLastLoginUser();
  const encrypted = store.get(`token-${userId}`) as string | undefined;
  if (!encrypted) return null;
  const token = decryptToken(encrypted);
  return token || null;
});

ipcMain.handle("delete-token", async (_event: IpcMainInvokeEvent) => {
  const userId = getLastLoginUser();
  store.delete(`token-${userId}`);
});

ipcMain.handle(
  "save-refresh-token",
  async (_event: IpcMainInvokeEvent, token: string) => {
    const userId = getLastLoginUser();
    store.set(`refresh-token-${userId}`, encryptToken(token));
  }
);

ipcMain.handle("get-refresh-token", async (_event: IpcMainInvokeEvent) => {
  const userId = getLastLoginUser();
  const encrypted = store.get(`refresh-token-${userId}`) as string | undefined;
  if (!encrypted) return null;
  const token = decryptToken(encrypted);
  return token || null;
});

ipcMain.handle("delete-refresh-token", async (_event: IpcMainInvokeEvent) => {
  const userId = getLastLoginUser();
  store.delete(`refresh-token-${userId}`);
});

// Renderer-driven token sync: the renderer is the source of truth for the
// current access token (it already runs the shared transport with refresh
// dedupe + cooldown). Whenever it persists or clears tokens it pushes the
// latest value here so the main-process httpClient — used by any future
// background workers — stays in lockstep and doesn't re-issue refreshes
// on a stale `Bearer`.
ipcMain.handle(
  "set-access-token",
  async (_event: IpcMainInvokeEvent, token: unknown) => {
    // Defensive guard: even though contextBridge constrains the renderer
    // surface, validate the payload type so a future preload regression
    // can't push arbitrary values into the main-process httpClient.
    if (typeof token !== "string" && token !== null) {
      return;
    }
    setMainHttpClientToken(token);
  }
);

/**
 * 登录成功：
 *   1. 用 uid 初始化账号 DB（含 store.set last-login-user）
 *   2. 销毁当前窗口（通常是 anon 或上一个用户的）并用 persist:user-<uid> 重建
 */
ipcMain.handle(
  "user:login-success",
  async (
    _event: IpcMainInvokeEvent,
    payload: {
      userId: number;
      accessToken?: string;
      refreshToken?: string;
    }
  ) => {
    const userId = Number(payload?.userId);
    if (!Number.isFinite(userId) || userId <= 0) {
      throw new Error("Invalid userId");
    }
    const previousUid = getLastLoginUser();
    runtimeLog.info("login committed start", {
      userId,
      hadPreviousUid: previousUid ?? null,
      switched: previousUid != null && previousUid !== userId
    });
    // 必须先 init DB（内部会写 last-login-user），再保存 tokens；
    // 因为窗口随后会被销毁，renderer 的后续 saveTokens 调用永远到不了。
    initDatabaseForUserPublic(userId);
    // 切账号关键步骤：先清空主进程 httpClient 的 token，再按 payload 重写。
    // payload 不带 accessToken 时（防御性场景）确保不残留旧用户 Bearer，
    // 直到 renderer 通过 set-access-token 推送新值。
    setMainHttpClientToken(null);
    if (typeof payload.accessToken === "string" && payload.accessToken) {
      store.set(`token-${userId}`, encryptToken(payload.accessToken));
      setMainHttpClientToken(payload.accessToken);
    }
    if (typeof payload.refreshToken === "string" && payload.refreshToken) {
      store.set(`refresh-token-${userId}`, encryptToken(payload.refreshToken));
    }
    recreateMainWindow(getUserPartitionName(userId));
    runtimeLog.info("login committed done", { userId });
    return true;
  }
);

/**
 * 退出登录：
 *   - 取消 in-flight 媒体下载、关闭 DB、清空偏好缓存
 *   - 删除当前 uid 的 token-<uid> / refresh-token-<uid> / last-login-user
 *   - wipeLocalData=true：清空 partition 存储 + fs.rm `<userData>/users/<uid>`
 *     与 partition 目录
 *   - 未勾选清理时不清 partition storage，保留 renderer 的
 *     IndexedDB / localStorage / cookie 以便下次同 uid 登录继续使用。
 *   - 用 persist:anon 重建主窗口
 */
ipcMain.handle(
  "user:logout",
  async (
    _event: IpcMainInvokeEvent,
    payload: { wipeLocalData?: boolean } | undefined
  ) => {
    const wipe = !!payload?.wipeLocalData;
    const uid = getCurrentUserId() ?? getLastLoginUser();

    runtimeLog.info("logout start", { uid: uid ?? null, wipe });

    cancelAllMediaDownloads();
    closeCurrentDatabase();
    resetUserPreferencesCache();
    setMainHttpClientToken(null);

    if (uid != null) {
      store.delete(`token-${uid}`);
      store.delete(`refresh-token-${uid}`);
      if (wipe) {
        runtimeLog.info("wiping local data", { uid });
        await clearPartitionStorage(getUserPartitionName(uid));
        dropAccountDataDir(uid);
        removePartitionDir(uid);
      }
    }
    store.delete("last-login-user");

    recreateMainWindow(ANON_PARTITION);
    runtimeLog.info("logout done", { uid: uid ?? null, wipe });
    return true;
  }
);

export { instanceId, store };
