import { useCallback, useEffect, useRef } from "react";
import log from "@/utils/log";
import type { AnyWsMessage, CallMediaType } from "@mushroom/shared";
import { getWSClient } from "../../ws/index";
import type { WsUiState } from "../../ws/WSClient";
import { CallChannel } from "./callChannel";
import { subscribeCallChannelPort } from "./callChannelPort";

const callLog = log.scope("call-relay");

/**
 * 通话信令 messageClassify 前缀集合：判定一条 WS 帧是否属于通话。
 * offer / answer / ice 也属于通话信令（1v1 SDP/候选）。
 */
function isCallFrame(payload: AnyWsMessage): boolean {
  const classify = payload.messageClassify;
  return (
    classify === "offer" ||
    classify === "answer" ||
    classify === "ice" ||
    classify.startsWith("call.")
  );
}

type UseMainCallRelayOptions = {
  /** 仅在独立通话窗模式启用（Electron 且 preload 暴露 openCallWindow）。 */
  enabled: boolean;
};

/**
 * 主窗 WS ↔ IPC 中转桥（见 docs/architecture/realtime-call.md §12.5）。
 *
 * 独立通话窗模式下，主窗不再本地消费通话信令，而是：
 *   - 入向：WS 收到 call.* / offer / answer / ice → 转发到信令通道 → 通话窗；
 *     首帧 call.invited 触发开窗。
 *   - 出向：通道 signal 帧 → 经主窗那条唯一 WS 发送（满足 C1）。
 *   - ws-status：把主窗 WS 连接状态广播给通话窗。
 *   - command：把主窗 UI 的「发起呼叫」意图转交通话窗执行。
 *
 * 返回 `relayInboundCallFrame`：供 useChat 的 WS 消息分发在通话窗模式下调用，
 * 替代本地 handleCallWsMessage。
 */
export function useMainCallRelay({ enabled }: UseMainCallRelayOptions) {
  const channelRef = useRef<CallChannel | null>(null);

  // 订阅主进程投递的 MessagePort，建立双向中转。
  useEffect(() => {
    if (!enabled) {
      return;
    }
    if (!window.electronAPI?.notifyCallChannelReady) {
      return;
    }

    const off = subscribeCallChannelPort(port => {
      const channel = new CallChannel(port, {
        // 出向：通话窗经通道回传的信令 → 经主窗 WS 发送。
        onSignal: payload => {
          void getWSClient()
            .then(ws => ws.sendMessage(payload))
            .catch(error => {
              callLog.warn("relay outbound signal failed", {
                classify: payload.messageClassify,
                error: error instanceof Error ? error.message : String(error)
              });
            });
        },
        // 通话窗崩溃 / 通道断裂：关闭陈旧 channel（停心跳）、置空指针，
        // 避免残留 channel + 常驻 interval（§5.6 B2 主窗侧），并请求主进程
        // 重铸通道以自愈（通话窗仍在时会重新拿到成对新 port）。
        onTimeout: () => {
          callLog.warn("relay channel timeout, resetting");
          if (channelRef.current === channel) {
            channelRef.current = null;
          }
          channel.close();
          void window.electronAPI?.requestCallChannel?.();
        }
      });
      channelRef.current?.close();
      channelRef.current = channel;
      channel.start();

      // 建链后订阅 WS 状态；addStatusHandler 会立即回调一次当前状态，
      // 故无需额外手动广播。先 remove 再 add，保证端口多次投递时同一
      // handler 不被重复注册（cleanup 只 remove 一次）。
      void getWSClient().then(ws => {
        ws.removeStatusHandler(pushWsStatus);
        ws.addStatusHandler(pushWsStatus);
      });
    });

    const pushWsStatus = (state: WsUiState) => {
      channelRef.current?.post({
        kind: "ws-status",
        connected: state.status === "connected"
      });
    };

    return () => {
      off?.();
      void getWSClient().then(ws => ws.removeStatusHandler(pushWsStatus));
      channelRef.current?.close();
      channelRef.current = null;
    };
  }, [enabled]);

  /**
   * 入向 call.* 帧分发（替代本地 handleCallWsMessage）。返回 true 表示已消费。
   * 转发到通话窗；若为来电首帧则开窗。
   */
  const relayInboundCallFrame = useCallback(
    (payload: AnyWsMessage): boolean => {
      if (!enabled || !isCallFrame(payload)) {
        return false;
      }
      // 来电首帧：开窗（incoming 态，不抢焦点）。
      if (payload.messageClassify === "call.invited") {
        void window.electronAPI?.openCallWindow?.("incoming");
      }
      channelRef.current?.postSignal(payload);
      return true;
    },
    [enabled]
  );

  /**
   * 主窗 UI 发起呼叫：开窗并把命令转交通话窗执行。命令携带原始
   * clientConversationId，由通话窗在自身 conversations 快照中解析为会话对象。
   * `targetUserIds` 可选：群聊发起时由主窗成员选择器选定，未传则通话窗
   * 回退为呼叫全群。
   */
  const startCallViaWindow = useCallback(
    (
      clientConversationId: string,
      mediaType: CallMediaType,
      targetUserIds?: number[]
    ) => {
      if (!enabled) {
        return false;
      }
      void window.electronAPI?.openCallWindow?.("ongoing");
      channelRef.current?.post({
        kind: "command",
        action: "start-call",
        clientConversationId,
        mediaType,
        targetUserIds
      });
      return true;
    },
    [enabled]
  );

  return {
    relayInboundCallFrame,
    startCallViaWindow
  };
}
