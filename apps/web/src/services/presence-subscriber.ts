import {
  PresenceSubscriber,
  type PresenceRealtimeAdapter,
  type ServerWsMessage,
  type ClientWsMessage,
  type AnyWsMessage
} from "@mushroom/shared";
import log from "@/utils/log";
import { getWSClient } from "../ws/index";
import type { WsUiState } from "../ws/WSClient";

/**
 * Web 端 PresenceSubscriber 适配器（与 Mobile 行为一致）。
 *
 * 复用 `getWSClient()` 单例。WSClient 暴露：
 *  - `addMessageHandler` 转发服务端帧
 *  - `addStatusHandler` 推送 WsUiState（status === "connected" 视为完成连接）
 *  - `sendMessage` 内部 waitForOpen，可安全送 presence.subscribe / unsubscribe
 *
 * 重连判定与 mobile 对齐：仅在“曾连过一次 → 断开 → 再次 connected”时触发。
 * 首次 connected 不算重连，避免 active 集合为空时白发。
 */
function createWebRealtimeAdapter(): PresenceRealtimeAdapter {
  let connected = false;
  let hadConnectedOnce = false;

  const messageListeners = new Set<(message: ServerWsMessage) => void>();
  const reconnectListeners = new Set<() => void>();

  const messageHandler = (message: AnyWsMessage) => {
    for (const listener of messageListeners) {
      try {
        listener(message as ServerWsMessage);
      } catch {
        // ignore listener errors
      }
    }
  };

  const statusHandler = (state: WsUiState) => {
    if (state.status === "connected") {
      if (connected) {
        return;
      }
      const wasReconnect = hadConnectedOnce;
      connected = true;
      hadConnectedOnce = true;
      if (wasReconnect) {
        for (const listener of reconnectListeners) {
          try {
            listener();
          } catch {
            // ignore
          }
        }
      }
    } else {
      connected = false;
    }
  };

  // 异步注册 handler 到单例 WS client
  void getWSClient().then(ws => {
    ws.addMessageHandler(messageHandler);
    ws.addStatusHandler(statusHandler);
  });

  return {
    send: (message: ClientWsMessage) => {
      void getWSClient()
        .then(ws => ws.sendMessage(message))
        .catch(err => {
          log.debug("presence-subscriber: send failed", err);
        });
    },
    onMessage: listener => {
      messageListeners.add(listener);
      return () => {
        messageListeners.delete(listener);
      };
    },
    onReconnected: listener => {
      reconnectListeners.add(listener);
      return () => {
        reconnectListeners.delete(listener);
      };
    },
    isConnected: () => connected
  };
}

export const webPresenceSubscriber = new PresenceSubscriber(
  createWebRealtimeAdapter()
);
