import { App as AntdApp, ConfigProvider, theme as antdTheme } from "antd";
import { message as antdMessage } from "antd";
import { useEffect, useMemo, useRef, useState } from "react";
import "../styles/app.css";
import type { AnyWsMessage, Conversation } from "@mushroom/shared";
import type { LoginUser } from "../types/user";
import type { WsUiState } from "../ws/WSClient";
import { getAccessToken, parseJwt } from "../utils/token";
import { AppThemeProvider } from "../theme";
import { useAppThemePreference } from "../theme/useAppThemePreference";
import { useChatCallSession } from "../hooks/useChatCallSession";
import { CallSessionModal } from "../components/chat/CallSessionModal";
import { CallChannel } from "../hooks/call/callChannel";
import { subscribeCallChannelPort } from "../hooks/call/callChannelPort";
import { AppErrorBoundary } from "../components/ui/AppErrorBoundary";
import { createCallChannelTransport } from "../hooks/call/callSignalTransport";
import log from "../utils/log";
import { i18n } from "../i18n";

const callWindowLog = log.scope("call-window");

const INITIAL_WS_STATE: WsUiState = {
  status: "connecting",
  attempt: 0,
  maxAttempts: 0
};

/**
 * 独立通话窗入口（见 docs/architecture/realtime-call.md §12.5）。
 *
 * 自举（C2 / C3）：
 *   - loginUser：getAccessToken + parseJwt 重建（token 经同 partition 共享）。
 *   - conversationsRef：IPC getConversations 拉快照 + onConversationSync 增量。
 *   - wsUiStateRef：由主窗经信令通道广播 ws-status 驱动。
 *
 * 信令：通过 CallChannel（MessagePort）与主窗那条唯一 WS 中转，不自连 WS（C1）。
 *   - 出向：useChatCallSession 经注入的 channel transport → 主窗 → WS。
 *   - 入向：通道 signal 帧 → handleCallWsMessage。
 */
function CallWindowContent() {
  const { resolvedTheme } = useAppThemePreference();

  const [loginUser, setLoginUser] = useState<LoginUser | null>(null);
  const [ready, setReady] = useState(false);
  // OS 窗口是否处于「缩小悬浮」态（§5.6）。由通话窗 UI 的最小化/还原驱动，
  // 并经 IPC 同步主进程收缩/还原 OS 窗口。
  const [windowMinimized, setWindowMinimized] = useState(false);

  const conversationsRef = useRef<Conversation[]>([]);
  const wsUiStateRef = useRef<WsUiState>(INITIAL_WS_STATE);
  const channelRef = useRef<CallChannel | null>(null);
  // 入向信令分发指针（late-binding：通道先建，handler 由通话栈稍后提供）。
  const inboundSignalRef = useRef<((payload: AnyWsMessage) => void) | null>(
    null
  );

  // 自举 loginUser + conversations 快照。
  useEffect(() => {
    let disposed = false;
    void (async () => {
      try {
        const token = await getAccessToken();
        const payload = token ? (parseJwt(token) as LoginUser | null) : null;
        if (!disposed && payload) {
          setLoginUser(payload);
        }
        const conversations =
          (await window.electronAPI?.getConversations?.(true)) ?? [];
        if (!disposed) {
          conversationsRef.current = conversations;
        }
      } catch (error) {
        callWindowLog.warn("call window bootstrap failed", {
          error: error instanceof Error ? error.message : String(error)
        });
      } finally {
        if (!disposed) {
          setReady(true);
        }
      }
    })();

    const offConvSync = window.electronAPI?.onConversationSync?.(() => {
      void window.electronAPI
        ?.getConversations?.(true)
        .then(list => {
          conversationsRef.current = list ?? [];
        })
        .catch(() => {
          // best effort：增量刷新失败不致命
        });
    });

    return () => {
      disposed = true;
      offConvSync?.();
    };
  }, []);

  // 建立信令通道（CallChannel）。通话栈用注入的 channel transport 收发信令。
  // transport 经 getter 读取当前活跃通道：真正的 MessagePort 在主进程投递后
  // 才注入 channelRef，故此处延迟解析，避免捕获过期通道。
  const transport = useMemo(
    () => createCallChannelTransport(() => channelRef.current),
    []
  );

  const call = useChatCallSession({
    loginUser,
    conversationsRef,
    wsUiStateRef,
    transport
  });
  const {
    handleCallWsMessage,
    handleStartAudioCall,
    handleStartVideoCall,
    dismissCallSession,
    callSession
  } = call;

  // 把通话栈的入向分发函数暴露给通道 onSignal。
  useEffect(() => {
    inboundSignalRef.current = handleCallWsMessage;
  }, [handleCallWsMessage]);

  // 把「发起呼叫」命令处理函数暴露给通道 onCommand。
  const startCallRef = useRef<
    | ((
        conversation: Conversation,
        isVideo: boolean,
        targetUserIds?: number[]
      ) => void)
    | null
  >(null);
  useEffect(() => {
    startCallRef.current = (conversation, isVideo, targetUserIds) => {
      if (isVideo) {
        void handleStartVideoCall(conversation, { targetUserIds });
      } else {
        void handleStartAudioCall(conversation, { targetUserIds });
      }
    };
  }, [handleStartAudioCall, handleStartVideoCall]);

  // 把安全收场函数暴露给通道 onTimeout（§5.6 B2）。
  const dismissRef = useRef<() => void>(() => {});
  useEffect(() => {
    dismissRef.current = dismissCallSession;
  }, [dismissCallSession]);

  // 当前是否存在活跃通话会话。供通道超时回调判断：仅在通话中才提示+收场，
  // 空闲预热窗（callSession 为 null）静默，避免误报「通话连接已断开」。
  const hasActiveSessionRef = useRef(false);
  useEffect(() => {
    hasActiveSessionRef.current = Boolean(callSession);
  }, [callSession]);

  // 订阅主进程投递的 MessagePort，替换占位端口并接通双向收发。
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.notifyCallChannelReady) {
      return;
    }
    const off = subscribeCallChannelPort(port => {
      const channel = new CallChannel(port, {
        onSignal: payload => {
          inboundSignalRef.current?.(payload);
        },
        onCommand: command => {
          if (command.action === "start-call") {
            const conversation = conversationsRef.current.find(
              item =>
                item.client_conversation_id === command.clientConversationId
            );
            if (conversation) {
              startCallRef.current?.(
                conversation,
                command.mediaType === 2,
                command.targetUserIds
              );
            } else {
              callWindowLog.warn("start-call: conversation not found", {
                clientConversationId: command.clientConversationId
              });
            }
          }
        },
        onWsStatus: connected => {
          wsUiStateRef.current = connected
            ? { status: "connected", attempt: 0, maxAttempts: 0 }
            : { status: "offline", attempt: 0, maxAttempts: 0 };
        },
        onTimeout: () => {
          // §5.6 B2：通道断裂（主窗崩溃 / IPC 失联）自动安全收场 + 提示。
          // 无论是否通话中，都请求主进程重铸通道以自愈（onTimeout 已一次性
          // 触发，收到新 port 重新连上后会复位守卫）。
          void window.electronAPI?.requestCallChannel?.();
          // 仅在通话中提示并收场；空闲预热窗静默——避免误报「通话连接已断开」。
          if (!hasActiveSessionRef.current) {
            callWindowLog.warn("call channel timeout while idle, healing");
            return;
          }
          callWindowLog.warn("call channel timeout, dismissing");
          void antdMessage.error(i18n.t("callActions.callDisconnected"));
          dismissRef.current();
        }
      });
      channelRef.current?.close();
      channelRef.current = channel;
      channel.start();
    });

    const offMinimize = api.onCallWindowRequestMinimize?.(() => {
      setWindowMinimized(true);
      void api.callWindowControl?.("minimize");
    });

    return () => {
      off?.();
      offMinimize?.();
      channelRef.current?.close();
      channelRef.current = null;
    };
    // transport 在 onSignal/onCommand/onTimeout 中通过 ref 取最新值，
    // 仅需在挂载时建立一次通道订阅。
  }, []);

  // 终态：会话消解后请求主进程隐藏通话窗（保留预热实例）。会话消解时一并
  // 复位最小化态，避免下次来电/发起复用预热窗时仍停留在悬浮形态。
  useEffect(() => {
    if (ready && loginUser && !callSession) {
      setWindowMinimized(false);
      void window.electronAPI?.hideCallWindow?.();
    }
  }, [ready, loginUser, callSession]);

  // 通话态变化 → 驱动主进程切换窗口三态（§5.6）。最小化态优先：用户已把
  // 通话窗收缩为悬浮小窗时，phase 固定为 minimized，不被通话态切回全尺寸。
  // 注意：依赖放 callSession.phase/.direction 而非整个 callSession 对象，
  // 避免点按麦克风/摄像头按钮时（setCallSession 产生新引用）误触发 IPC
  // 而导致 Electron 窗口抖动。
  const callPhase = callSession?.phase;
  const callDirection = callSession?.direction;
  useEffect(() => {
    if (!callPhase) {
      return;
    }
    let phase: "incoming" | "ongoing" | "minimized";
    if (windowMinimized) {
      phase = "minimized";
    } else if (callPhase === "ringing" && callDirection === "incoming") {
      phase = "incoming";
    } else {
      phase = "ongoing";
    }
    void window.electronAPI?.applyCallWindowState?.(phase);
  }, [callPhase, callDirection, windowMinimized]);

  return (
    <ConfigProvider
      theme={{
        algorithm:
          resolvedTheme === "dark"
            ? antdTheme.darkAlgorithm
            : antdTheme.defaultAlgorithm,
        token: {
          colorPrimary: "#00A884",
          borderRadius: 16
        },
        components: {
          Button: {
            borderRadius: 8,
            primaryShadow: "none",
            defaultBorderColor: "transparent"
          }
        }
      }}
    >
      <AntdApp>
        <CallSessionModal
          callSession={callSession}
          currentUserId={loginUser?.userId ?? null}
          localStream={call.localCallStream}
          remoteStream={call.remoteCallStream}
          groupParticipantMedia={call.groupParticipantMedia}
          groupLocalSpeaking={call.groupLocalSpeaking}
          onAccept={call.handleAcceptCall}
          onReject={call.handleRejectCall}
          onEnd={call.handleEndCall}
          onClose={dismissCallSession}
          onToggleLocalMedia={call.handleToggleLocalMedia}
          displayMode="window"
          windowMinimized={windowMinimized}
          onRequestWindowMinimize={() => {
            setWindowMinimized(true);
            void window.electronAPI?.callWindowControl?.("minimize");
          }}
          onRequestWindowRestore={() => {
            setWindowMinimized(false);
            void window.electronAPI?.callWindowControl?.("restore");
          }}
        />
      </AntdApp>
    </ConfigProvider>
  );
}

export default function CallWindowApp() {
  return (
    <AppErrorBoundary>
      <AppThemeProvider>
        <CallWindowContent />
      </AppThemeProvider>
    </AppErrorBoundary>
  );
}
