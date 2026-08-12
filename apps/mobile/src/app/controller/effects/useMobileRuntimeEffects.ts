import { useEffect, type RefObject } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { computeTotalUnread } from "@mushroom/shared";
import type {
  MobilePushRegistration,
  MobileNotificationPayload
} from "../../../platform/notification-center";
import {
  clearIncomingCallNotification,
  consumePendingNotificationOpen,
  initializeNotificationCenter,
  setAppBadgeCount,
  syncPushRegistration
} from "../../../platform/notification-center";
import {
  consumePendingSystemCallAction,
  endSystemCall,
  initializeSystemCallManager
} from "../../../platform/system-call";
import { initializeVoipPush } from "../../../platform/push-provider";
import { runCallPermissionGuide } from "../../../platform/call-system-permissions";
import { updateMobileVoipToken } from "../../../services/runtime/device-identity";
import { mobileVoiceRecorder } from "../../../platform/voice-recorder";
import {
  bindMobileUserSession,
  ensureMobileFreshAccessToken,
  mobileAppController,
  mobileDeviceInfo,
  mobileRealtimeClient,
  registerCurrentMobileDevice
} from "../../../services/app-runtime";
import { accountNamespace } from "../../../services/account-namespace";
import { loadAddressBookMatchCache } from "../../../data/address-book-match-cache";
import { checkAddressBookPermission } from "../../../platform/address-book";
import { getReadableErrorMessage } from "../../../utils/error-message";
import type { MobileAppState } from "../useMobileAppState";
import { i18n } from "../../../i18n";

export function useMobileRuntimeEffects(params: {
  state: MobileAppState;
  pendingSystemCallActionRef: RefObject<{
    type: "answer" | "end";
    callId: string;
  } | null>;
  openPayloadEvent: (payload: MobileNotificationPayload) => Promise<void>;
  registerPushRegistrationEvent: (
    registration: MobilePushRegistration
  ) => Promise<void>;
  acceptCallByIdEvent: (callId: string) => Promise<void>;
  rejectOrEndCallByIdEvent: (callId: string) => Promise<void>;
  silentRefreshAddressBookMatches: (options?: {
    isCancelled?: () => boolean;
  }) => Promise<void>;
}) {
  const {
    state,
    pendingSystemCallActionRef,
    openPayloadEvent,
    registerPushRegistrationEvent,
    acceptCallByIdEvent,
    rejectOrEndCallByIdEvent,
    silentRefreshAddressBookMatches
  } = params;

  useEffect(() => {
    if (!state.snapshot?.auth.accessToken) {
      state.setAddressBookMatches([]);
      state.setAddressBookPermission("unknown");
      return;
    }

    let cancelled = false;
    const isCancelled = () => cancelled;
    let lastPermission: "authorized" | "denied" | "unknown" = "unknown";

    void loadAddressBookMatchCache()
      .then(entries => {
        if (!cancelled) {
          state.setAddressBookMatches(entries);
        }
      })
      .catch(() => {
        if (!cancelled) {
          state.setAddressBookMatches([]);
        }
      });

    // 启动时静默检查系统通讯录权限：
    // - 已授权：直接展示已注册联系人；并触发一次静默刷新（参考 Telegram 行为）。
    // - 未知/被拒：保持原有引导卡片不变。
    void checkAddressBookPermission().then(permission => {
      if (cancelled) return;
      lastPermission = permission;
      state.setAddressBookPermission(permission);
      if (permission === "authorized") {
        void silentRefreshAddressBookMatches({ isCancelled });
      }
    });

    // App 从后台回到前台时再次校验权限：
    // - 覆盖用户去系统设置改动权限再回到 App 的场景。
    // - 若权限刚从非 authorized 切换到 authorized，则触发一次静默刷新，
    //   否则用户不会看到任何匹配结果（卡片在已授权 + 空匹配时是隐藏的）。
    const handleAppStateChange = (nextStatus: AppStateStatus) => {
      if (nextStatus !== "active") return;
      void checkAddressBookPermission().then(permission => {
        if (cancelled) return;
        const previousPermission = lastPermission;
        lastPermission = permission;
        state.setAddressBookPermission(permission);
        if (permission !== "authorized") return;
        // 刚从 denied/unknown 升级为 authorized → 立即刷新；
        // 或者已授权但当前缓存为空（覆盖启动 check 与设置授权竞态）。
        if (
          previousPermission !== "authorized" ||
          state.addressBookMatches.length === 0
        ) {
          void silentRefreshAddressBookMatches({ isCancelled });
        }
      });
    };
    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange
    );

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [state.snapshot?.auth.accessToken]);

  useEffect(() => {
    state.callSessionRef.current = state.callSession;
  }, [state.callSession, state.callSessionRef]);

  useEffect(() => {
    let previousAccessToken: string | null | undefined =
      state.snapshot?.auth.accessToken ?? null;
    const unsubscribe = mobileAppController.subscribe(nextSnapshot => {
      const nextAccessToken = nextSnapshot.auth.accessToken ?? null;
      // When the session is cleared (logout / forced unauth from a refresh
      // failure), drop any sticky error banner so the auth screen is not
      // permanently capped by a stale Chinese-translated error like
      // "登录状态已过期，请重新登录。". Mirrors the desktop/web behavior.
      if (previousAccessToken && !nextAccessToken) {
        state.setError("");
      }
      previousAccessToken = nextAccessToken;

      state.setSnapshot(nextSnapshot);
      // Drive the OS app-icon badge (WeChat-style) from the single source of
      // truth: aggregate unread across non-muted conversations. This covers
      // the foreground / backgrounded-but-alive states (where the WS feeds
      // fresh snapshots); the killed state is handled by the server-set APNs
      // `aps.badge` instead. When the session is cleared the snapshot carries
      // an empty conversation list, so the badge naturally drops to 0.
      void setAppBadgeCount(
        computeTotalUnread(nextSnapshot.data.conversations)
      );
      state.setActiveConversationId(currentConversationId => {
        if (!currentConversationId) {
          return currentConversationId;
        }

        const exists = nextSnapshot.data.conversations.some(
          item => item.client_conversation_id === currentConversationId
        );
        return exists ? currentConversationId : null;
      });
    });

    let cancelled = false;

    async function bootstrap() {
      try {
        // Cold-start: if a user was persisted across launches, rebind
        // the runtime to their per-user MMKV namespace + SQLite database
        // *before* any controller call reads auth tokens or repository
        // state. When no uid is persisted (fresh install / logged out)
        // we leave the runtime in its detached state; the UI will route
        // to the login screen, and `controller.login()` will bind on
        // first successful auth.
        //
        // Pre-multi-account legacy residue (mushroom-mobile.db / old
        // long-key MMKV entries / mushroom-media-cache) is intentionally
        // NOT cleaned up here: mobile data is purely a cache, and old
        // users upgrading will simply re-login and resync from scratch.
        // The unused files are inert and the OS will reclaim them when
        // the user uninstalls or on low-storage warnings.
        const persistedUid = accountNamespace.get();
        if (persistedUid) {
          try {
            await bindMobileUserSession(persistedUid);
          } catch (bindError) {
            // This namespace will never bind successfully (corrupt SQLite,
            // damaged storage, residue from a buggy version that committed
            // the namespace before bootstrap landed, etc). Clear it so the
            // next cold start falls straight through to AuthScreen and the
            // user can log in again.
            //
            // Intentionally NOT calling logout / wipeLocalData here: bind
            // failed before any session was actually built, and the local
            // cache may still be valid — keeping it lets a re-login on the
            // same uid render cached conversations immediately.
            accountNamespace.set(null);
            if (!cancelled) {
              state.setError(getReadableErrorMessage(bindError));
              state.setStatus(i18n.t("app.loadAccountFailed"));
            }
            return;
          }
          // Refresh the persisted access token *before* the controller fans
          // out its first bootstrap requests. Without this gate, every
          // launch with an expired access token would race N parallel
          // requests carrying the same dead `Bearer`, the server would
          // reject them, and N separate /auth/refresh calls would pile up
          // (only the first matching the server's refresh_token_hash). The
          // shared transport's single-flight + cooldown handle the
          // steady-state case; this gate handles the cold-start case.
          await ensureMobileFreshAccessToken();
          await mobileAppController.bootstrap();

          // Startup recovery: 修正上次崩溃 / 强杀残留的 "假发送中" 消息，
          // 重建 outbox 引用对应的 UI 可见性，并清理孤儿文件。延迟若干秒
          // 触发，避开 bootstrap 后立刻可能发起的新上传；幂等。
          setTimeout(() => {
            void mobileAppController.runStartupRecovery();
          }, 5000);

          // Cold-start fallback: bind + bootstrap completed but the
          // authStore has neither an access nor a refresh token. This
          // happens when:
          //   - upgrading from a buggy version that committed the
          //     namespace before persistTokens (orphan namespace), or
          //   - bootstrap's internal refreshAuth failed and called
          //     clearLocalSession on us.
          // Clearing the namespace here lets App.tsx's guard
          // (`!isAuthenticated && persistedUid → skeleton`) fall through
          // to the AuthScreen branch on the very same render pass.
          const snapshot = await mobileAppController.snapshot();
          if (!snapshot.auth.accessToken && !snapshot.auth.refreshToken) {
            accountNamespace.set(null);
          }
        }
      } catch (currentError) {
        if (!cancelled) {
          state.setError(getReadableErrorMessage(currentError));
          state.setStatus(i18n.t("app.bootFailed"));
        }
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    // Cold-start: a killed app may have been answered/declined via the system
    // call UI (iOS CallKit/VoIP, Android ConnectionService) before the JS
    // runtime came up. RNCallKeep persisted the action; stash it now and let
    // the auth-gated effect below replay it once we have a valid session
    // (rebuilding the call from the server requires an access token).
    pendingSystemCallActionRef.current = consumePendingSystemCallAction();

    const pendingPayload = consumePendingNotificationOpen();
    if (pendingPayload) {
      void openPayloadEvent(pendingPayload);
    }

    const cleanupNotifications = initializeNotificationCenter({
      onOpenPayload: payload => openPayloadEvent(payload),
      onForegroundPayload: async payload => {
        if (payload.type === "call.invite") {
          await openPayloadEvent(payload);
        }
      },
      onPushRegistration: registration =>
        registerPushRegistrationEvent(registration)
    });

    const cleanupCallKeep = initializeSystemCallManager({
      onAnswerCall: async action => {
        // Delegate to the by-id accept so foreground (session present) and
        // background/killed (session must be rebuilt) converge on one path.
        // Clear the persisted action so a warm-runtime answer can never be
        // replayed by the cold-start effect on the next launch.
        pendingSystemCallActionRef.current = null;
        consumePendingSystemCallAction();
        await acceptCallByIdEvent(action.callId);
      },
      onEndCall: async action => {
        pendingSystemCallActionRef.current = null;
        consumePendingSystemCallAction();
        await rejectOrEndCallByIdEvent(action.callId);
      }
    });

    // iOS PushKit (VoIP): the native layer reports CallKit synchronously on push
    // receipt (so background/killed incoming calls ring reliably). We capture
    // the VoIP token (to register this device on the dedicated APNs VoIP
    // channel) and, as a fallback, pre-warm the call session from the push
    // payload so answering connects WebRTC without waiting on the WS.
    const cleanupVoip = initializeVoipPush({
      onToken: token => {
        const changed = updateMobileVoipToken(token);
        if (changed && state.snapshot?.auth.accessToken) {
          void registerCurrentMobileDevice().catch(() => undefined);
        }
      },
      onPush: payload => {
        const callId =
          typeof payload?.call_id === "string" ? payload.call_id : "";
        if (!callId) {
          return;
        }
        const pushType =
          typeof payload?.type === "string" ? payload.type : "call.invite";
        // A `call.missed` VoIP push is a cancellation/timeout: dismiss the
        // ringing system call instead of rebuilding/connecting one. Mirrors the
        // background handler in `index.js`.
        if (pushType === "call.missed") {
          void clearIncomingCallNotification(callId);
          void endSystemCall(callId);
          return;
        }
        void openPayloadEvent({
          type: "call.invite",
          callId,
          conversationId:
            typeof payload?.conversation_id === "string"
              ? payload.conversation_id
              : undefined
        } as MobileNotificationPayload);
      }
    });

    return () => {
      cleanupNotifications();
      cleanupCallKeep();
      cleanupVoip();
    };
  }, []);

  // Auth-gated replay of a cold-start system-call action. Runs once the access
  // token is available (immediately if already authenticated, or when bootstrap
  // finishes), so `getCallState` inside the by-id handlers can authenticate.
  useEffect(() => {
    if (!state.snapshot?.auth.accessToken) {
      return;
    }
    const pendingAction = pendingSystemCallActionRef.current;
    if (!pendingAction?.callId) {
      return;
    }
    pendingSystemCallActionRef.current = null;
    if (pendingAction.type === "answer") {
      void acceptCallByIdEvent(pendingAction.callId);
    } else {
      void rejectOrEndCallByIdEvent(pendingAction.callId);
    }
  }, [state.snapshot?.auth.accessToken]);

  // First-launch call-permission walk-through (notifications + Android telecom
  // phone account + OEM background-restriction guidance). Runs on cold start so
  // killed/background incoming calls can reliably wake the system call UI.
  // Idempotent and self-gated by a persisted flag.
  useEffect(() => {
    void runCallPermissionGuide();
  }, []);

  useEffect(() => {
    return () => {
      state.clearCallDismissTimer();
      state.dismissCallSessionNow();
      mobileVoiceRecorder.stopRecorder().catch(() => {});
      mobileVoiceRecorder.stopPlayer().catch(() => {});
      mobileVoiceRecorder.removeRecordBackListener();
      mobileVoiceRecorder.removePlayBackListener();
      mobileVoiceRecorder.removePlaybackEndListener();
      if (state.typingIndicatorTimerRef.current) {
        clearTimeout(state.typingIndicatorTimerRef.current);
      }
      if (state.typingSignalTimerRef.current) {
        clearTimeout(state.typingSignalTimerRef.current);
      }
      state.setPeerTypingActivity(null);
    };
  }, []);

  useEffect(() => {
    if (state.snapshot?.auth.accessToken) {
      void mobileRealtimeClient.connect();
      if (mobileDeviceInfo.pushToken && mobileDeviceInfo.pushProvider) {
        void registerCurrentMobileDevice().catch(() => undefined);
      } else {
        void syncPushRegistration(registration =>
          registerPushRegistrationEvent(registration)
        );
      }
      return;
    }

    mobileRealtimeClient.disconnect();
  }, [state.snapshot?.auth.accessToken]);
}
