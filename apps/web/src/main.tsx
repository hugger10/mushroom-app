// import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/global.css";
import { initAppI18n } from "./i18n";
import { isCallWindowRoute } from "./utils/runtimeMode";
import log from "./utils/log";

/**
 * 全局错误日志桥（可诊断性补强）。
 *
 * React 错误边界只能捕获**渲染树内**的异常；模块初始化、原生事件回调、
 * 未处理的 Promise 拒绝等**树外**崩溃不会被它接住。此前「contextBridge 传
 * MessagePort 致 `port.start` 抛错 → 整窗白屏」正是树外异常，且**未进
 * electron-log 文件**，只能靠 F12 截图定位。这里在模块顶层（早于任何页面
 * 渲染、覆盖主窗与通话窗两个入口）注册全局兜底，把树外崩溃转发到文件日志。
 */
const bootLog = log.scope("boot");
window.addEventListener("error", event => {
  bootLog.error("uncaught error", {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    stack: event.error instanceof Error ? event.error.stack : null
  });
});
window.addEventListener("unhandledrejection", event => {
  const reason = event.reason;
  bootLog.error("unhandled rejection", {
    message: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : null
  });
});

/**
 * 入口分流（见 docs/architecture/realtime-call.md §12.5）。
 *
 * 关键：两个入口必须**动态 import**，不能在模块顶层静态 import。
 * 静态 import 会让任一入口在求值时一并加载另一入口的整棵模块图；而
 * `App.tsx` 一侧存在模块级 eager 副作用（如 services/presence-subscriber.ts
 * 顶层即 `getWSClient()` 建 WS）。若通话窗静态引入 `App`，即便只渲染
 * `CallWindowApp`，也会顺带触发 `App` 侧的副作用，建立第二条同 deviceId 的
 * WS，与主窗那条相互 same-deviceId 驱逐（违反 C1，导致反复 1006 断连）。
 *
 * 按路由动态 import 后，通话窗永不求值 `App` 的模块图，从根上杜绝该回归。
 */
void initAppI18n().finally(async () => {
  const root = createRoot(document.getElementById("root")!);
  if (isCallWindowRoute()) {
    const { default: CallWindowApp } = await import("./app/CallWindowApp.tsx");
    root.render(<CallWindowApp />);
  } else {
    const { default: App } = await import("./App.tsx");
    root.render(<App />);
  }
});
