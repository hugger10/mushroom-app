import {
  BrowserWindow,
  MessageChannelMain,
  ipcMain,
  screen,
  session
} from "electron";
import type { IpcMainInvokeEvent } from "electron";
import path from "node:path";
import isDev from "electron-is-dev";
import { registerMediaCacheProtocolForSession } from "./media-cache";
import log from "../utils/log";

const callLog = log.scope("call-window");

/**
 * 独立通话窗口管理（见 docs/architecture/realtime-call.md §12.2 / §12.3）。
 *
 * 设计要点：
 *   - 与主窗共用同一份 renderer，经 hash 路由 `#/call-window` 分流到
 *     精简的通话窗入口（决策 D1）。
 *   - 预热常驻（§5.6 B1）：随主窗创建即建好并隐藏，来电/发起时仅 show()，
 *     消除冷启动白屏与「错过短振铃」。
 *   - 信令不在通话窗自连 WS（C1），而是经 MessageChannelMain 与主窗那条
 *     唯一 WS 中转。
 *   - 窗口属性随通话态三态变化（§5.6），由 renderer 经 IPC 驱动
 *     applyCallWindowState。
 *   - 拦截 close = 最小化为悬浮态（§5.6 A4），不挂断、不销毁；真正销毁仅在
 *     登录/登出（C5）由 closeCallWindow() 触发。
 */

let callWindow: BrowserWindow | null = null;
/** 记录当前通话窗所属 partition，便于与主窗 partition 校验一致。 */
let callWindowPartition: string | null = null;
/**
 * 信令通道代次号。`MessageChannelMain` 的一对 port 只能投递一次，但任一侧
 * renderer 重建（HMR / reload / 会话过期回登录页再进 / relay 卸载重挂）后会
 * 丢失旧 port 且无法复用，导致通道「一坏永坏」。故改为「可重建」：每次建链都
 * 新铸一对 port 成对投递，两侧 renderer 收到新 port 即关闭旧通道无缝换链
 * （channelRef replace-on-new-port）。该号仅用于去抖期间识别「最新一次请求」。
 * 通话窗销毁时复位。
 */
let channelGeneration = 0;
/** 建链去抖定时器：合并启动期两侧并发的就绪请求，避免重复铸链。 */
let channelDebounceTimer: ReturnType<typeof setTimeout> | null = null;
/**
 * 取主窗访问器。建链需同时持有主窗与通话窗；由 createCallWindow /
 * registerCallWindowIpc 注入，供 IPC 驱动的「按需重建」复用。
 */
let mainWindowAccessor: (() => BrowserWindow | null) | null = null;
/**
 * 最近一次应用的通话态。用于实现 §5.6 A2「接通瞬间一次性 focus()」：
 * 仅在「非 ongoing → ongoing」跃迁时 focus 一次，避免 ongoing 态每次
 * applyCallWindowState 都抢焦点压住聊天主窗。通话窗销毁时复位。
 */
let lastAppliedPhase: CallWindowPhase | null = null;

export type CallWindowPhase = "incoming" | "ongoing" | "minimized";

/** 三态窗口几何/行为参数（§5.6 表）。 */
const PHASE_GEOMETRY: Record<
  CallWindowPhase,
  { width: number; height: number }
> = {
  incoming: { width: 360, height: 520 },
  ongoing: { width: 900, height: 640 },
  minimized: { width: 288, height: 180 }
};

function loadCallRoute(win: BrowserWindow) {
  if (isDev) {
    const rendererUrl = process.env.ELECTRON_RENDERER_URL;
    if (!rendererUrl) {
      throw new Error("Missing ELECTRON_RENDERER_URL in development mode");
    }
    void win.loadURL(`${rendererUrl}#/call-window`);
  } else {
    void win.loadFile(path.join(__dirname, "..", "renderer", "index.html"), {
      hash: "/call-window"
    });
  }
}

/**
 * 创建（或返回已存在的）通话窗。默认隐藏，预热常驻。
 *
 * @param getMainWindow 取主窗，用于通话窗加载完成后即建立信令通道
 *   （两窗就绪即建链，保证首个入向 call.* 帧能立即转发，不依赖开窗时机）。
 */
export function createCallWindow(
  partition: string,
  getMainWindow?: () => BrowserWindow | null
): BrowserWindow {
  if (getMainWindow) {
    mainWindowAccessor = getMainWindow;
  }
  if (callWindow && !callWindow.isDestroyed()) {
    return callWindow;
  }

  registerMediaCacheProtocolForSession(session.fromPartition(partition));

  const win = new BrowserWindow({
    show: false,
    frame: false,
    resizable: true,
    width: PHASE_GEOMETRY.ongoing.width,
    height: PHASE_GEOMETRY.ongoing.height,
    minWidth: PHASE_GEOMETRY.minimized.width,
    minHeight: PHASE_GEOMETRY.minimized.height,
    skipTaskbar: true,
    webPreferences: {
      backgroundThrottling: false,
      preload: path.join(__dirname, "..", "preload", "index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      partition
    }
  });
  callWindow = win;
  callWindowPartition = partition;

  // 拦截 close：改为最小化为悬浮态（§5.6 A4），不销毁不挂断。
  // 真正销毁只走 closeCallWindow()（设置 forceClose 标记）。
  win.on("close", event => {
    if (win.isDestroyed()) {
      return;
    }
    if ((win as { __forceClose?: boolean }).__forceClose) {
      return;
    }
    event.preventDefault();
    win.webContents.send("call-window:request-minimize");
  });

  win.on("closed", () => {
    if (callWindow === win) {
      callWindow = null;
      callWindowPartition = null;
      channelGeneration = 0;
      if (channelDebounceTimer) {
        clearTimeout(channelDebounceTimer);
        channelDebounceTimer = null;
      }
      lastAppliedPhase = null;
    }
  });

  // 两窗就绪即建立信令通道，保证首个入向 call.* 帧可立即转发。
  win.webContents.once("did-finish-load", () => {
    const main = (getMainWindow ?? mainWindowAccessor)?.();
    if (main) {
      establishCallChannel(main);
    }
  });

  loadCallRoute(win);
  callLog.info("call window created (prewarm, hidden)", { partition });
  return win;
}

export function getCallWindow(): BrowserWindow | null {
  return callWindow && !callWindow.isDestroyed() ? callWindow : null;
}

export function getCallWindowPartition(): string | null {
  return callWindowPartition;
}

/**
 * 真正销毁通话窗（仅登录/登出 C5 调用）。绕过 close 拦截。
 */
export function closeCallWindow() {
  const win = callWindow;
  callWindow = null;
  callWindowPartition = null;
  channelGeneration = 0;
  if (channelDebounceTimer) {
    clearTimeout(channelDebounceTimer);
    channelDebounceTimer = null;
  }
  lastAppliedPhase = null;
  if (win && !win.isDestroyed()) {
    (win as { __forceClose?: boolean }).__forceClose = true;
    win.destroy();
  }
}

/**
 * 把通话窗显示出来并按通话态切换窗口属性（§5.6）。
 */
export function showCallWindow(phase: CallWindowPhase = "ongoing") {
  const win = getCallWindow();
  if (!win) {
    return;
  }
  const wasVisible = win.isVisible();
  applyCallWindowState(phase);
  if (!wasVisible) {
    // §5.6 A1：来电态置顶但不抢焦点，避免全屏盖住用户当前操作；其余态
    // 正常 show()（ongoing 的一次性 focus 由 applyCallWindowState 处理）。
    if (phase === "incoming") {
      win.showInactive();
    } else {
      win.show();
    }
  }
}

/**
 * 按通话态设置置顶/任务栏/焦点/尺寸（§5.6 三态表）。
 */
export function applyCallWindowState(phase: CallWindowPhase) {
  const win = getCallWindow();
  if (!win) {
    return;
  }

  switch (phase) {
    case "incoming":
      // 置顶但不抢焦点（A1）；进任务栏。
      win.setAlwaysOnTop(true, "floating");
      win.setSkipTaskbar(false);
      break;
    case "ongoing":
      // 全尺寸不置顶（A2），可被主窗切到前面；进任务栏。
      win.setAlwaysOnTop(false);
      win.setSkipTaskbar(false);
      break;
    case "minimized":
      // 缩小悬浮态置顶 + skipTaskbar（对齐微信/钉钉）。
      win.setAlwaysOnTop(true, "floating");
      win.setSkipTaskbar(true);
      break;
  }

  resizeForPhase(win, phase);

  // §5.6 A2：接通瞬间一次性 focus()。仅在「非 ongoing → ongoing」跃迁时
  // 抢一次焦点（来电应答 / 发起接通），之后 ongoing 态不再反复抢焦点，
  // 让用户可把聊天主窗切到前面边聊边通话。
  if (phase === "ongoing" && lastAppliedPhase !== "ongoing") {
    if (win.isMinimized()) {
      win.restore();
    }
    win.focus();
  }
  lastAppliedPhase = phase;
}

function resizeForPhase(win: BrowserWindow, phase: CallWindowPhase) {
  const geom = PHASE_GEOMETRY[phase];
  const [curW, curH] = win.getSize();
  if (curW === geom.width && curH === geom.height) {
    return;
  }
  // 多屏位置约束（§5.6 A5）：缩小态钳制到最近屏幕 workArea 右下角。
  if (phase === "minimized") {
    const bounds = win.getBounds();
    const display = screen.getDisplayNearestPoint({
      x: bounds.x,
      y: bounds.y
    });
    const { workArea } = display;
    const x = Math.min(
      Math.max(workArea.x, bounds.x),
      workArea.x + workArea.width - geom.width
    );
    const y = Math.min(
      Math.max(workArea.y, bounds.y),
      workArea.y + workArea.height - geom.height
    );
    win.setBounds({ x, y, width: geom.width, height: geom.height });
    return;
  }
  win.setSize(geom.width, geom.height);
  win.center();
}

/**
 * 在主窗与通话窗之间建立专用双向信令通道（MessageChannelMain）。
 * 两个 renderer 在 preload 中通过 `call-channel` 事件拿到各自的 MessagePort。
 *
 * 「可重建」语义（见 channelGeneration 注释）：每次调用都新铸一对 port 成对
 * 投递，两侧 renderer 收到新 port 即关闭旧通道无缝换链。这样任一侧 renderer
 * 重建（HMR / reload / relay 重挂）后只要重新发起就绪请求，即可重新拿到 port，
 * 彻底消除旧实现中「通道一坏永坏」的结构性缺陷。
 */
export function establishCallChannel(mainWindow: BrowserWindow) {
  const win = getCallWindow();
  if (!win || mainWindow.isDestroyed() || win.webContents.isDestroyed()) {
    return;
  }
  channelGeneration += 1;
  const { port1, port2 } = new MessageChannelMain();
  mainWindow.webContents.postMessage("call-channel", null, [port1]);
  win.webContents.postMessage("call-channel", null, [port2]);
  callLog.info("call channel established (main <-> call window)", {
    generation: channelGeneration
  });
}

/**
 * 按需（去抖）重建信令通道。renderer 任一侧就绪（含重建/reload）时经
 * `call-channel:request` 调用：用短去抖合并启动期两侧的并发请求，避免在极短
 * 时间内重复铸链；窗口任一侧缺失时跳过（待其就绪后会再次请求）。
 */
function requestEstablishCallChannel() {
  if (channelDebounceTimer) {
    return;
  }
  channelDebounceTimer = setTimeout(() => {
    channelDebounceTimer = null;
    const main = mainWindowAccessor?.();
    const win = getCallWindow();
    if (!main || main.isDestroyed() || !win) {
      return;
    }
    establishCallChannel(main);
  }, 50);
}

/**
 * 注册通话窗相关 IPC。`getMainWindow` 用于建立信令通道时取主窗。
 */
export function registerCallWindowIpc(
  getMainWindow: () => BrowserWindow | null
) {
  mainWindowAccessor = getMainWindow;

  // renderer 任一侧就绪/重建后请求建链（按需可重建，自愈断链）。
  ipcMain.handle("call-channel:request", () => {
    requestEstablishCallChannel();
  });

  ipcMain.handle("call-window:open", (_event, phase?: CallWindowPhase) => {
    const main = getMainWindow();
    if (!main) {
      return false;
    }
    showCallWindow(phase ?? "ongoing");
    establishCallChannel(main);
    return true;
  });

  ipcMain.handle(
    "call-window:apply-state",
    (_event, phase: CallWindowPhase) => {
      applyCallWindowState(phase);
    }
  );

  ipcMain.handle(
    "call-window:control",
    (
      _event: IpcMainInvokeEvent,
      action: "minimize" | "restore" | "close" | "toggle-maximize"
    ) => {
      const win = getCallWindow();
      if (!win) {
        return;
      }
      switch (action) {
        case "minimize":
          applyCallWindowState("minimized");
          break;
        case "restore":
          applyCallWindowState("ongoing");
          if (!win.isVisible()) {
            win.show();
          }
          win.focus();
          break;
        case "toggle-maximize":
          // 双击通话面：在最大化与 ongoing 尺寸间切换（对齐桌面窗口双击习惯）。
          if (win.isMaximized()) {
            win.unmaximize();
          } else {
            win.maximize();
          }
          callLog.info("toggle-maximize", { maximized: win.isMaximized() });
          break;
        case "close":
          // 用户从通话窗 UI 主动收场：隐藏窗口（保留预热实例）。
          win.hide();
          break;
      }
    }
  );

  ipcMain.handle("call-window:hide", () => {
    const win = getCallWindow();
    win?.hide();
  });

  // renderer 判断自身是否运行在通话窗中。
  ipcMain.handle("call-window:is-call-window", (event: IpcMainInvokeEvent) => {
    const win = getCallWindow();
    return Boolean(win && event.sender === win.webContents);
  });
}
