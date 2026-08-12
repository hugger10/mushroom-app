import NetInfo from "@react-native-community/netinfo";
import { useEffect, type RefObject } from "react";
import { AppState } from "react-native";
import {
  ApiError,
  CALL_STATUS_CANCELLED,
  CALL_STATUS_ENDED,
  CALL_STATUS_FAILED,
  CALL_STATUS_TIMEOUT,
  PRESENCE_DIRECT_CHAT_STALE_MS,
  type UserPresenceSummary
} from "@mushroom/shared";
import {
  mobileAppController,
  mobileRealtimeClient,
  mobileServerApi
} from "../../../services/app-runtime";
import { mobilePresenceSubscriber } from "../../../services/presence-subscriber";
import { isLoggingOut } from "../../../services/session-lifecycle";
import { clearIncomingCallNotification } from "../../../platform/notification-center";
import { endSystemCall } from "../../../platform/system-call";
import { applyConversationDisplayFallbacks } from "../../../utils/display";
import log from "../../../utils/log";
import type { MobileCallUiSession } from "../../../types/app";
import type { MobileAppState } from "../useMobileAppState";

const connLog = log.scope("conn");

/**
 * 通话是否处于"需要保持信令连接存活"的阶段。拨号中（ringing）与通话中
 * （ongoing）都依赖实时信令；busy/rejected/timeout/ended 为终态，无需保活。
 */
function isCallKeepingConnectionAlive(
  callSession: MobileCallUiSession | null
): boolean {
  if (!callSession) {
    return false;
  }
  return callSession.phase === "ringing" || callSession.phase === "ongoing";
}

function isTerminalCallStatus(status: unknown): boolean {
  return (
    status === CALL_STATUS_ENDED ||
    status === CALL_STATUS_CANCELLED ||
    status === CALL_STATUS_TIMEOUT ||
    status === CALL_STATUS_FAILED
  );
}

/** Incoming/outgoing ringing TTL — aligns with the server `directCallTimeoutMs`. */
const CALL_RINGING_TTL_MS = 60_000;

/**
 * True when a ringing call has been around longer than the server-side call
 * TTL. The server may still mark a call `ringing` if the peer's hang-up never
 * reached it (e.g. the peer was offline); such a stale UI is meaningless.
 */
function isRingingOverdue(session: MobileCallUiSession): boolean {
  const createdAt = Date.parse(session.session?.created_at ?? "");
  if (!Number.isFinite(createdAt)) {
    return false;
  }
  return Date.now() - createdAt > CALL_RINGING_TTL_MS;
}

/**
 * 回前台时用服务端权威状态校验残留的活跃通话：
 * app 退后台期间 Android 冻结 JS 执行，对方挂断的 `call.ended` / `call.rejected`
 * 信令可能丢失（WS 重连不会重放历史消息），导致本地 `callSession` 残留
 * ringing/ongoing，UI 错误停留在接听/通话界面（点接听会得到服务端
 * "call already ended"）。此处校验服务端状态，已结束则清理本地会话。
 *
 * 只在服务端明确为终态或业务级 404 时清理；5xx / 网络错误保守跳过，
 * 避免误杀真实进行中的通话。
 */
async function reconcileActiveCallWithServer(state: MobileAppState) {
  const session = state.callSessionRef.current;
  if (
    !session ||
    (session.phase !== "ringing" && session.phase !== "ongoing")
  ) {
    // No active call session: clear any stale incoming-call notification that
    // the peer may have hung up while we were backgrounded (its `call.missed`
    // push could have been lost). The accept/decline notification must not
    // linger into the next app foreground.
    if (state.callSessionRef.current == null) {
      await clearIncomingCallNotification();
    }
    return;
  }

  const cleanUpStaleCall = () => {
    connLog.info("reconciled stale call with server", {
      callId: session.call_id,
      phase: session.phase
    });
    state.dismissCallSessionNow();
    void endSystemCall(session.call_id);
    void clearIncomingCallNotification(session.call_id);
  };

  try {
    const result = await mobileServerApi.getCallState({
      callId: session.call_id
    });
    if (isTerminalCallStatus(result.data?.session?.status)) {
      cleanUpStaleCall();
    } else if (session.phase === "ringing" && isRingingOverdue(session)) {
      // 服务端仍标记 ringing（对方挂断消息可能未达服务端 / 状态同步延迟），
      // 但本地已超过来电 TTL：该呼叫实际已结束，残留的全屏通话画面无意义。
      connLog.warn("reconciled overdue ringing call", {
        callId: session.call_id
      });
      cleanUpStaleCall();
    }
  } catch (error) {
    const is4xx =
      error instanceof ApiError && error.status != null && error.status < 500;
    if (is4xx) {
      // 4xx 业务错误（call 不存在 / 无权限）→ 通话已结束，清理。
      cleanUpStaleCall();
      return;
    }
    // 5xx / 网络错误：回前台瞬间 token 刷新或网络可能未就绪。对"未接通"
    // 的 ringing 残留（来电 TTL ~60s，回前台时大概率已超时或对方已挂断），
    // 即便校验失败也清理，避免残留无意义的全屏通话画面；ongoing 真实通话
    // 保守跳过（避免误杀）。
    if (session.phase === "ringing") {
      connLog.warn("reconcile ringing call failed; cleaning up stale UI", {
        callId: session.call_id,
        err: error instanceof Error ? error.message : String(error)
      });
      cleanUpStaleCall();
    }
  }
}

export function useMobileConnectivityEffects(params: {
  state: MobileAppState;
  appStateRef: RefObject<string>;
  networkOnlineRef: RefObject<boolean>;
  presenceMapRef: RefObject<Record<number, UserPresenceSummary>>;
  presenceLastActiveAtRef: RefObject<Record<number, string>>;
  requestPresenceEvent: (userIds: number[]) => Promise<boolean>;
  refreshVisiblePresenceEvent: () => void;
  refreshListPresenceEvent: (
    userIds: number[] | "all-direct-peers",
    options?: { force?: boolean; dedupWindowMs?: number }
  ) => Promise<void>;
  flushOutgoingQueueEvent: () => Promise<void>;
}) {
  const {
    state,
    appStateRef,
    networkOnlineRef,
    presenceMapRef,
    presenceLastActiveAtRef,
    requestPresenceEvent,
    refreshVisiblePresenceEvent,
    refreshListPresenceEvent,
    flushOutgoingQueueEvent
  } = params;

  useEffect(() => {
    const subscription = AppState.addEventListener("change", nextState => {
      const prev = appStateRef.current;
      appStateRef.current = nextState;
      if (prev !== nextState) {
        connLog.info("app state", { from: prev, to: nextState });
      }
      if (!state.snapshot?.auth.accessToken || isLoggingOut()) {
        return;
      }

      if (nextState === "active") {
        void mobileRealtimeClient.reconnect();
        void mobileAppController.syncNow();
        refreshVisiblePresenceEvent();
        // B：应用从后台回前台时强制刷新整个会话列表的 presence，
        // 避免列表绿点停留在过期值。force=true 跳过 30s 去重窗口。
        void refreshListPresenceEvent("all-direct-peers", {
          force: true
        });
        // 校验残留的活跃通话：后台期间丢失的挂断信令可能导致本地 callSession
        // 停在 ringing/ongoing，用服务端状态纠正并清理。
        void reconcileActiveCallWithServer(state);
        return;
      }

      // 仅在真正进入 background 时主动断开 WebSocket。
      // iOS 在弹出系统弹窗（图片/文档 picker、AttachmentSheet 的 Modal 等）
      // 以及来电中断时会把 AppState 短暂切到 "inactive"；若此时 disconnect，
      // 顶部会闪出"网络已断开"横幅，体验很糟糕。
      // 参考 platform/media-cache.ts:504 中相同的"仅 background 视为暂停"策略。
      if (nextState === "background") {
        // 通话进行中（拨号 ringing / 通话 ongoing）时必须保持信令通道存活，
        // 否则按 Home 键切后台会断开 WebSocket，导致收不到 offer/answer/ice/
        // call.ended 等信令，通话事实上中断。对齐 WhatsApp/Telegram/微信的
        // 后台通话行为：信令保活（本步）+ Android 前台服务 + 视频 PiP。
        // callSessionRef 由 useMobileRuntimeEffects 实时同步，读 ref 始终最新，
        // 不受本 effect 闭包陈旧影响。
        if (isCallKeepingConnectionAlive(state.callSessionRef.current)) {
          connLog.info("skip background disconnect: active call in progress", {
            phase: state.callSessionRef.current?.phase
          });
          return;
        }
        mobileRealtimeClient.disconnect();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [state.snapshot?.auth.accessToken]);

  useEffect(() => {
    if (!state.snapshot?.auth.accessToken) {
      presenceMapRef.current = {};
      presenceLastActiveAtRef.current = {};
      state.setUserPresenceByUserId({});
      return;
    }
  }, [state.snapshot?.auth.accessToken, state.setUserPresenceByUserId]);

  useEffect(() => {
    if (!NetInfo?.addEventListener) {
      return;
    }

    return NetInfo.addEventListener(
      (nextState: {
        isConnected?: boolean | null;
        isInternetReachable?: boolean | null;
      }) => {
        const isOnline =
          Boolean(nextState.isConnected) &&
          nextState.isInternetReachable !== false;
        const wasOnline = networkOnlineRef.current;
        if (wasOnline !== isOnline) {
          connLog.info("net change", {
            from: wasOnline,
            to: isOnline,
            reachable: nextState.isInternetReachable
          });
        }
        networkOnlineRef.current = isOnline;

        if (!state.snapshot?.auth.accessToken || isLoggingOut()) {
          return;
        }

        if (!wasOnline && isOnline) {
          void mobileRealtimeClient.reconnect();
          void mobileAppController.syncNow();
          void flushOutgoingQueueEvent();
          refreshVisiblePresenceEvent();
          // 网络恢复时强制刷新会话列表 presence，绕过 30s 去重窗口。
          void refreshListPresenceEvent("all-direct-peers", {
            force: true
          });
          return;
        }
      }
    );
  }, [state.snapshot?.auth.accessToken]);

  useEffect(() => {
    if (!state.snapshot?.auth.accessToken) {
      return;
    }

    const peerIds = new Set<number>();
    for (const conversation of state.conversations) {
      if (conversation.type !== 1) continue;
      const peerId = Number(conversation.peer_id || 0);
      if (Number.isFinite(peerId) && peerId > 0) {
        peerIds.add(peerId);
      }
    }
    // P2 按需订阅：会话列表内所有 1-on-1 peer 都纳入订阅集，
    // 服务端会按设备维度去重，并通过 ping 心跳续期 TTL。
    // 注：当前未做 FlatList visibility tracking，整个列表一次性订阅；
    // 后续可优化为只订阅可见项以降低带宽。
    mobilePresenceSubscriber.syncList(peerIds);

    // A：列表加载/变更时立即拉取一次所有直聊 peer 的 presence，
    // 不再被动等待 5min 兜底轮询或 WS 推送。
    // refreshListPresenceEvent 内部有 30s 去重 + 分批请求，安全可重复触发。
    const peerIdArray = Array.from(peerIds);
    void refreshListPresenceEvent(peerIdArray);

    // HTTP 兜底轮询（5min）：WS 订阅链路可能因下面任一原因漏推
    //   1. 对端非正常断开（断网 / 强杀 app / 心跳超时），服务端 30~70s 后才 broadcast offline
    //   2. 跨节点订阅状态不同步（如 Redis 抖动）
    //   3. 客户端订阅 TTL 过期但重连/续期窗口未及时刷新
    // 进入聊天详情才发现"列表绿点 vs 详情真实离线"不一致体验很糟糕，
    // 因此与详情页对称引入一个 5min 列表批量刷新。
    // 注意：requestPresenceEvent 内置 in-flight 去重 + appState!=active 时 noop，
    //      不会加重后台资源消耗。
    if (peerIdArray.length === 0) {
      // 故意不在 cleanup 里清空 list scope：deps 中含 state.conversations，
      // 每次会话列表变更都会触发 cleanup→syncList(peerIds)，cleanup 中
      // syncList([]) 会让共享层差量 diff 退化为全量 unsub→sub。
      return;
    }
    const interval = setInterval(() => {
      void requestPresenceEvent(peerIdArray);
    }, PRESENCE_DIRECT_CHAT_STALE_MS);

    return () => {
      clearInterval(interval);
    };

    // 故意不在 cleanup 里清空 list scope（见上）。登出由 !accessToken 分支处理。
  }, [
    state.snapshot?.auth.accessToken,
    state.conversations,
    requestPresenceEvent,
    refreshListPresenceEvent
  ]);

  useEffect(() => {
    if (!state.snapshot?.auth.accessToken || !state.activeConversation) {
      mobilePresenceSubscriber.syncConversation(null);
      return;
    }

    const [normalizedActiveConversation] = applyConversationDisplayFallbacks({
      conversations: [state.activeConversation],
      contacts: state.friends,
      loginUser: state.snapshot.auth.user
    });
    const peerId =
      normalizedActiveConversation?.type === 1
        ? Number(normalizedActiveConversation.peer_id || 0)
        : 0;
    if (!Number.isFinite(peerId) || peerId <= 0) {
      mobilePresenceSubscriber.syncConversation(null);
      return;
    }

    // P2 按需订阅：进入会话详情即声明对该 peer 的兴趣
    mobilePresenceSubscriber.syncConversation(peerId);

    // 进入会话时的 presence 刷新策略（与 web 端 useChat 对齐）：
    //   - WS 已连：服务端会在 presence.subscribe 后立刻回推一次 presence.snapshot，
    //     这是权威且最新的状态；此处再发 HTTP /presence-batch 反而会引入
    //     "HTTP(stale=false) 与 WS snapshot(true) 乱序覆盖"问题。客户端虽然
    //     已加 observed_at 单调性保护，避免无谓的额外请求仍是更干净的方案。
    //   - WS 未连：才走 HTTP 兜底，避免空白 header。
    // 同时下线 5min 轮询：P2 按需订阅 + 服务端 transition 主动推送已无必要，
    // 保留只会增加无意义流量并放大乱序窗口。
    if (state.realtimeStatus.status !== "connected") {
      void requestPresenceEvent([peerId]);
    }

    return () => {
      // 离开会话详情：撤销 conversation scope 订阅。
      // list scope 仍可能持有同一 peer，由 listSubscribers 的并集保证不漏推。
      mobilePresenceSubscriber.syncConversation(null);
    };
  }, [
    state.snapshot?.auth.accessToken,
    state.snapshot?.auth.user,
    state.activeConversation,
    state.friends,
    state.realtimeStatus.status
  ]);
}
