import type { AnyWsMessage } from "@mushroom/shared";
import { getWSClient } from "../../ws/index";
import type { CallChannel } from "./callChannel";

/**
 * 通话信令传输抽象。
 *
 * 把「如何把一条通话信令发出去 / 当前设备标识是什么」从通话栈中解耦，
 * 使同一套通话逻辑（useChatCallSession / useCallWsBridge）既能运行在
 * 「主窗口直接走 WS」的环境，也能运行在「独立通话窗经 IPC 中转」的环境
 * （见 docs/architecture/realtime-call.md §12.5）。
 *
 * - 主窗实现（createWsCallSignalTransport）：直接复用全局单例 WSClient，
 *   行为与改造前逐行等价。
 * - 通话窗实现（后续 P2 新增）：经 MessageChannel 把帧回传主窗，由主窗
 *   那条唯一的 WS 连接发送，避免「同 deviceId 双 WS 连接」。
 */
export type CallSignalTransport = {
  /** 当前设备标识；不可用时返回 null。 */
  getDeviceId: () => Promise<string | null>;
  /** 发送一条已构造完整的通话信令消息。 */
  sendCallMessage: (message: AnyWsMessage) => Promise<void>;
};

/**
 * 主窗口默认实现：直接走全局单例 WSClient。
 */
export function createWsCallSignalTransport(): CallSignalTransport {
  return {
    async getDeviceId() {
      const ws = await getWSClient();
      return ws.getDeviceId();
    },
    async sendCallMessage(message) {
      const ws = await getWSClient();
      await ws.sendMessage(message);
    }
  };
}

/**
 * 进程内共享的主窗 transport 单例（稳定引用，便于作为 hook 依赖）。
 */
export const wsCallSignalTransport: CallSignalTransport =
  createWsCallSignalTransport();

/**
 * 通话窗实现：经 MessageChannel 把信令回传主窗，由主窗那条唯一 WS 发送
 * （满足 C1：通话窗不自连第二条 WS）。deviceId 取自主进程（与主窗 WS 一致）。
 *
 * `getChannel` 返回当前活跃通道；通道在主进程投递 MessagePort 后才就绪，
 * 故用 getter 延迟解析，避免捕获过期的占位通道。
 */
export function createCallChannelTransport(
  getChannel: () => CallChannel | null
): CallSignalTransport {
  return {
    async getDeviceId() {
      const deviceId = await window.electronAPI?.getDeviceId?.();
      return deviceId ?? null;
    },
    async sendCallMessage(message) {
      getChannel()?.postSignal(message);
    }
  };
}
