/**
 * 运行模式判定：区分「主窗」与「独立通话窗」（见
 * docs/architecture/realtime-call.md §12.5）。
 *
 * 通话窗经 hash 路由 `#/call-window` 加载同一份 renderer。判定优先读
 * URL hash（同步、无需等待 IPC），用于入口分流。
 */
export function isCallWindowRoute(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.location.hash.replace(/^#/, "").startsWith("/call-window");
}

/** 是否运行在 Electron（存在 preload 注入的 electronAPI）。 */
export function isElectronRuntime(): boolean {
  return typeof window !== "undefined" && Boolean(window.electronAPI);
}
