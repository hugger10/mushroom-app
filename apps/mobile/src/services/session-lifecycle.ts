import { useSyncExternalStore } from "react";

// 模块级标志：标识当前是否正在执行"退出登录"动作。
// - 同步可读：effects 层可直接调用 isLoggingOut() 决策。
// - 可订阅：UI 层通过 useIsLoggingOut() 订阅以触发重渲染。
//
// 设计目的：在 logout 期间抑制由 WS 断开/重连引起的 ConnectionBanner
// 抖动，以及 AppState/NetInfo 在登出窗口内的自动 reconnect。
let loggingOut = false;
const listeners = new Set<() => void>();

export function isLoggingOut(): boolean {
  return loggingOut;
}

export function setLoggingOut(value: boolean): void {
  if (loggingOut === value) {
    return;
  }
  loggingOut = value;
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // best effort
    }
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): boolean {
  return loggingOut;
}

export function useIsLoggingOut(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
