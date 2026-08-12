import { useEffect, useEffectEvent, type RefObject } from "react";
import {
  mergePresenceSummary,
  type ServerWsMessage,
  type UserPresenceSummary
} from "@mushroom/shared";
import {
  mobileAppController,
  mobileRealtimeClient
} from "../../../services/app-runtime";
import type { MobileRealtimeStatus } from "../../../services/realtime";
import { isLoggingOut } from "../../../services/session-lifecycle";
import { normalizeOnlineFlag } from "../../../utils/display";
import type { MobileAppState } from "../useMobileAppState";

function isSameRealtimeStatus(
  current: MobileRealtimeStatus,
  next: MobileRealtimeStatus
) {
  return (
    current.status === next.status &&
    current.attempt === next.attempt &&
    current.maxAttempts === next.maxAttempts &&
    current.nextDelayMs === next.nextDelayMs
  );
}

export function useMobileRealtimeEffects(params: {
  state: MobileAppState;
  presenceMapRef: RefObject<Record<number, UserPresenceSummary>>;
  presenceLastActiveAtRef: RefObject<Record<number, string>>;
  flushOutgoingQueueEvent: () => Promise<void>;
  handleRealtimeSocketMessageEvent: (message: ServerWsMessage) => Promise<void>;
}) {
  const {
    state,
    presenceMapRef,
    presenceLastActiveAtRef,
    flushOutgoingQueueEvent,
    handleRealtimeSocketMessageEvent
  } = params;

  useEffect(() => {
    presenceMapRef.current = state.userPresenceByUserId;
  }, [state.userPresenceByUserId]);

  const handleStatusChangeEvent = useEffectEvent(
    (nextStatus: MobileRealtimeStatus) => {
      state.setRealtimeStatus(currentStatus =>
        isSameRealtimeStatus(currentStatus, nextStatus)
          ? currentStatus
          : nextStatus
      );
      if (nextStatus.status === "connected") {
        state.setCatchingUp(true);
        void flushOutgoingQueueEvent();
        // WS 重连后必须主动 syncNow，否则后台中段缺失的消息要等到下一次
        // foreground / network-recovery / openConversation 才会补齐
        // 这是移动端缺失的 backfill 触发点（桌面端在 WSClient.handleConnected
        // 已通过 runSyncOrchestrator 走过同一路径）。
        // 注意：必须在 useEffectEvent 中读取 state，闭包才是最新的；直接在
        // mount 时捕获 state 会让 snapshot 恒为 null，导致 syncNow 永不执行。
        if (state.snapshot?.auth.accessToken && !isLoggingOut()) {
          void mobileAppController.syncNow();
          // 重连后补齐群已读高水位（可能错过若干 group_read 帧）。
          const activeConv = state.activeConversation;
          if (
            activeConv &&
            activeConv.type === 2 &&
            activeConv.server_conversation_id
          ) {
            void mobileAppController.refreshConversationReadState(
              activeConv.server_conversation_id
            );
          }
        }
        return;
      }
      // 离开 connected（idle/connecting/offline/reconnecting）时清除悬挂的
      // catchingUp，避免"重连后无同步"时 flag 长期悬挂、后续无关同步误显示
      // "收取中..."。
      if (state.catchingUp) {
        state.setCatchingUp(false);
      }
    }
  );

  useEffect(() => {
    return mobileRealtimeClient.addStatusListener(nextStatus => {
      handleStatusChangeEvent(nextStatus);
    });
  }, []);

  useEffect(() => {
    return mobileRealtimeClient.addMessageListener(message => {
      if (message.messageClassify === "presence") {
        state.setUserPresenceByUserId(current => {
          const userId = Number(message.user_id);
          const merged = mergePresenceSummary(
            current[userId],
            {
              is_online: normalizeOnlineFlag(message.is_online),
              active_device_count: message.active_device_count,
              last_active_at:
                message.last_active_at ?? current[userId]?.last_active_at,
              // 透传服务端观测时刻：参与 mergePresenceSummary 的单调性判定，
              // 避免 HTTP/WS 乱序到达造成 is_online 在"在线/X 分钟前活跃"间闪烁。
              observed_at: message.observed_at
            },
            presenceLastActiveAtRef.current[userId]
          );
          const next = {
            ...current,
            [userId]: merged
          };
          if (merged.last_active_at) {
            presenceLastActiveAtRef.current = {
              ...presenceLastActiveAtRef.current,
              [userId]: merged.last_active_at
            };
          }
          presenceMapRef.current = next;
          return next;
        });
        return;
      }

      if (message.messageClassify === "presence.snapshot") {
        // P2 服务端在 subscribe 后立即回推一次 snapshot，
        // 复用 PresenceChangedMessage 的合并路径，逐条入 store。
        if (!Array.isArray(message.entries) || message.entries.length === 0) {
          return;
        }
        state.setUserPresenceByUserId(current => {
          let next = current;
          for (const entry of message.entries) {
            const userId = Number(entry.user_id);
            if (!Number.isFinite(userId) || userId <= 0) continue;
            const merged = mergePresenceSummary(
              next[userId],
              {
                is_online: normalizeOnlineFlag(entry.is_online),
                active_device_count: entry.active_device_count,
                last_active_at:
                  entry.last_active_at ?? next[userId]?.last_active_at,
                observed_at: entry.observed_at
              },
              presenceLastActiveAtRef.current[userId]
            );
            next = { ...next, [userId]: merged };
            if (merged.last_active_at) {
              presenceLastActiveAtRef.current = {
                ...presenceLastActiveAtRef.current,
                [userId]: merged.last_active_at
              };
            }
          }
          presenceMapRef.current = next;
          return next;
        });
        return;
      }

      if (message.messageClassify === "typing") {
        const conversationId = String(message.conversation_id || "");
        const senderUserId = Number(message.sender_user_id || 0);
        const timerKey = `${conversationId}:${senderUserId}`;

        if (!message.active) {
          if (state.typingIndicatorTimerRef.current) {
            clearTimeout(state.typingIndicatorTimerRef.current);
            state.typingIndicatorTimerRef.current = null;
          }
          state.setTypingConversationId(current =>
            current === message.conversation_id ? null : current
          );
          state.setPeerTypingActivity(null);

          if (conversationId && senderUserId) {
            const idleTimer = state.typersIdleTimersRef.current[timerKey];
            if (idleTimer) {
              clearTimeout(idleTimer);
              delete state.typersIdleTimersRef.current[timerKey];
            }
            state.setTypersByConversationId(current => {
              const typers = current[conversationId];
              if (!typers || !(senderUserId in typers)) return current;
              const nextTypers = { ...typers };
              delete nextTypers[senderUserId];
              const next = { ...current };
              if (Object.keys(nextTypers).length === 0) {
                delete next[conversationId];
              } else {
                next[conversationId] = nextTypers;
              }
              return next;
            });
          }
          return;
        }

        state.setTypingConversationId(message.conversation_id);
        state.setPeerTypingActivity(message.activity ?? "text");
        if (state.typingIndicatorTimerRef.current) {
          clearTimeout(state.typingIndicatorTimerRef.current);
        }
        state.typingIndicatorTimerRef.current = setTimeout(() => {
          state.setTypingConversationId(null);
          state.setPeerTypingActivity(null);
          state.typingIndicatorTimerRef.current = null;
        }, 3200);

        if (conversationId && senderUserId) {
          const existingIdle = state.typersIdleTimersRef.current[timerKey];
          if (existingIdle) clearTimeout(existingIdle);
          state.typersIdleTimersRef.current[timerKey] = setTimeout(() => {
            state.setTypersByConversationId(current => {
              const typers = current[conversationId];
              if (!typers || !(senderUserId in typers)) return current;
              const nextTypers = { ...typers };
              delete nextTypers[senderUserId];
              const next = { ...current };
              if (Object.keys(nextTypers).length === 0) {
                delete next[conversationId];
              } else {
                next[conversationId] = nextTypers;
              }
              return next;
            });
            delete state.typersIdleTimersRef.current[timerKey];
          }, 6000);

          const activity: "text" | "voice" =
            message.activity === "voice" ? "voice" : "text";
          state.setTypersByConversationId(current => {
            const typers = current[conversationId] ?? {};
            if (typers[senderUserId]?.activity === activity) return current;
            return {
              ...current,
              [conversationId]: { ...typers, [senderUserId]: { activity } }
            };
          });
        }
        return;
      }

      if (message.messageClassify === "privacy_sync") {
        // 服务端在 update 后 fire-and-forget 推送的完整 envelope。
        // controller 负责 version 单调 + 关闭时清群已读缓存；
        // 这里把 settings 同步回 UI 状态以驱动 toggle / 勾的 gate。
        const changed = mobileAppController.applyPrivacySyncFrame({
          settings: message.settings,
          version: message.version,
          updated_at: message.updated_at
        });
        if (changed) {
          state.setPrivacySettings(message.settings);
        }
        return;
      }

      void handleRealtimeSocketMessageEvent(message);
    });
  }, []);

  useEffect(() => {
    if (state.realtimeStatus.status === "connected") {
      void flushOutgoingQueueEvent();
    }
  }, [state.realtimeStatus.status]);

  // Clear `catchingUp` once a sync completes: the first sync after a WS
  // (re)connect is the "catching up on missed messages" window. Using the
  // functional setter keeps this effect independent of `catchingUp` itself.
  useEffect(() => {
    if (!state.snapshot?.metrics.syncing) {
      state.setCatchingUp(prev => (prev ? false : prev));
    }
  }, [state.snapshot?.metrics.syncing]);
}
