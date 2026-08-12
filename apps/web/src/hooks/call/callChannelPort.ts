/**
 * 主世界侧：订阅信令通道端口（见 docs/architecture/realtime-call.md §12.4）。
 *
 * 背景：Electron `contextBridge` 无法跨隔离世界传递 `MessagePort`（结构化克隆
 * 会丢失 `start`/`postMessage`/`onmessage` 等原型方法，主世界拿到「贫血」对象，
 * 调用 `port.start()` 即 `is not a function`）。因此 preload 改用
 * `window.postMessage(tag, "*", [port])` 把端口**转移**进主世界；主世界用
 * `window.addEventListener("message")` 收到的 `event.ports[0]` 才是真 MessagePort。
 *
 * 时序：preload 顶层常驻监听主进程的 `call-channel` 并缓冲端口；本订阅注册好
 * window 监听后调用 `notifyCallChannelReady()` 握手，触发 preload 把缓冲端口
 * 转移过来（`window.postMessage` 不为后注册监听器缓存，故需此握手）。
 */
import log from "@/utils/log";

const callPortLog = log.scope("call-port");

/** 与 preload 约定的端口转移消息标签。必须与 preload 内常量保持一致。 */
const CALL_CHANNEL_PORT_MSG = "mushroom:call-channel-port";

/**
 * 单订阅者守卫（契约：同一 renderer 同一时刻只应有一个订阅者）。
 *
 * 信令端口由 preload 经 `window.postMessage` 转移、且只投递一份；若出现两个
 * 订阅者会各持同一 port 引发争用（onmessage 互相覆盖 / 端口被提前 close）。
 * 重复订阅时仅告警、不硬失败（避免误伤 dev HMR 的重挂载——其 cleanup 会先
 * 解除旧订阅，正常配对不触发告警）。
 */
let hasActiveSubscriber = false;

/**
 * 订阅信令通道端口。回调每次拿到一个真 MessagePort（主进程每次建链投递一个）。
 * 返回取消订阅函数。
 *
 * 契约：单订阅者。见上方 hasActiveSubscriber 说明。
 */
export function subscribeCallChannelPort(
  callback: (port: MessagePort) => void
): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }
  if (hasActiveSubscriber) {
    callPortLog.warn(
      "duplicate call-channel port subscriber detected; ports are single-consumer"
    );
  }
  hasActiveSubscriber = true;
  const listener = (event: MessageEvent) => {
    // 来源校验：仅接受本窗 preload 经 window.postMessage 转移的端口，
    // 过滤潜在的 iframe / 跨源 message（纵深防御）。
    if (event.source !== window) {
      return;
    }
    if (event.data !== CALL_CHANNEL_PORT_MSG) {
      return;
    }
    const port = event.ports[0];
    if (port) {
      callback(port);
    }
  };
  window.addEventListener("message", listener);
  // 握手：通知 preload 主世界监听已就绪，冲刷缓冲端口（含预热阶段先到的端口）。
  window.electronAPI?.notifyCallChannelReady?.();
  return () => {
    window.removeEventListener("message", listener);
    hasActiveSubscriber = false;
  };
}
