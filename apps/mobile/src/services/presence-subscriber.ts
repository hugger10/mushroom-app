import {
  PresenceSubscriber,
  type PresenceRealtimeAdapter,
  type ServerWsMessage
} from "@mushroom/shared";
import { mobileRealtimeClient } from "./app-runtime";

/**
 * Mobile 端 PresenceSubscriber 单例。
 *
 * MobileRealtimeClient 已经具备：
 *  - sendMessage：支持任意 ClientWsMessage（含 presence.subscribe / unsubscribe）
 *  - addMessageListener：转发服务端帧给 listener
 *  - addStatusListener：监听 status 切换，"connected" 等价于"重连完成"
 *
 * 这里实现 PresenceRealtimeAdapter 把 MobileRealtimeClient 适配到共享层。
 *
 * 注意：onReconnected 通过 status === "connected" 触发；首次连接也会触发一次，
 * 此时 active 为空，是 noop，不会造成误发。
 */
function createMobileRealtimeAdapter(): PresenceRealtimeAdapter {
  // 与 web adapter 对齐：用 connected + hadConnectedOnce 双 flag 区分
  // "首次连接"和"真正重连"。原单 flag 实现在 connected→disconnected→
  // connecting→connected 序列中第二次 connected 会因 connected===false
  // 走 else 分支，仅置 flag 而不触发 listener，导致客户端断网恢复后
  // 永不重新订阅 presence。
  let connected = false;
  let hadConnectedOnce = false;
  return {
    send: message => {
      // sendMessage 内部会等待 open；presence 帧丢失对业务无致命影响，吞掉异常
      void mobileRealtimeClient.sendMessage(message).catch(() => {
        // ignore
      });
    },
    onMessage: listener => {
      const wrapped = (message: ServerWsMessage) => {
        try {
          listener(message);
        } catch {
          // ignore listener errors
        }
      };
      return mobileRealtimeClient.addMessageListener(wrapped);
    },
    onReconnected: listener => {
      return mobileRealtimeClient.addStatusListener(status => {
        if (status.status === "connected") {
          if (connected) {
            return;
          }
          const wasReconnect = hadConnectedOnce;
          connected = true;
          hadConnectedOnce = true;
          if (wasReconnect) {
            try {
              listener();
            } catch {
              // ignore
            }
          }
        } else {
          connected = false;
        }
      });
    },
    isConnected: () => connected
  };
}

export const mobilePresenceSubscriber = new PresenceSubscriber(
  createMobileRealtimeAdapter()
);
