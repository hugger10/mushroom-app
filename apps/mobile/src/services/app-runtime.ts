import { createMobileAppController } from "@mushroom/app-core";
import * as RNFS from "react-native-fs";
import { createMobileServerApi } from "./api";
import { accountNamespace } from "./account-namespace";
import { deleteUnifiedPushToken } from "../platform/push-provider";
import { dropUserStorageCache } from "../data/storage";
import { dropMobileSQLiteForUser } from "../data/sqlite-connection";
import log from "../utils/log";

import { mobileDeviceInfo } from "./runtime/device-identity";
import {
  bootAuthStore,
  bootCheckpointStore,
  bootRepository
} from "./runtime/boot-stubs";
import { getActiveApi } from "./runtime/api-proxy";
import { createSessionForUser, teardownActiveSession } from "./runtime/session";
import { getActiveSession, setActiveSession } from "./runtime/session-state";
import { registerController } from "./runtime/controller-handle";
// Side-effect import: registers the muted-conversation resolver with the
// notification center at module load time so the FCM/HMS background
// handler always finds a resolver even before any user is bound.
import { dispatchIncomingChatMessageNotification } from "./runtime/notifications-bridge";
import { MobileOutboxStore } from "./outbox-store";

const runtimeLog = log.scope("runtime");

// ---------------------------------------------------------------------------
// Account session: per-user storage / repository / api / realtime singletons.
// ---------------------------------------------------------------------------
// Each successful login (or cold-start with a persisted uid) calls
// `bindMobileUserSession(uid)`, which constructs a fresh AuthSessionStore,
// SyncCheckpointStore, MobileDataRepository, MobileServerApi and
// MobileRealtimeClient bound to that user's MMKV namespace and SQLite
// database. `unbindMobileUserSession()` tears the session down and (when
// `wipeLocalData === true`) deletes the per-user MMKV namespace, SQLite
// database file, and media/outbox directories.
//
// `mobileAppController`, `mobileServerApi` and `mobileRealtimeClient` are
// exposed to the rest of the app as ES module-level Proxy handles, so the
// ~366 callsites that capture them at import time keep working when the
// underlying instance is swapped out on user switch.

export const mobileAppController = createMobileAppController({
  // The MushroomApi handle behaves as a thin Proxy that routes every call
  // to the currently-active session, falling back to the pre-auth
  // transport before any user has been bound (covers login / register
  // before bindUser fires).
  api: new Proxy({} as ReturnType<typeof createMobileServerApi>, {
    get(_target, prop) {
      const target = getActiveApi() as unknown as Record<
        string | symbol,
        unknown
      >;
      const value = target[prop];
      if (typeof value === "function") {
        return (value as (...args: unknown[]) => unknown).bind(getActiveApi());
      }
      return value;
    }
  }) as ReturnType<typeof createMobileServerApi>,
  authStore: bootAuthStore,
  checkpoints: bootCheckpointStore,
  repository: bootRepository,
  deviceInfo: mobileDeviceInfo,
  // 自有存储（"outbox"）：把待发送附件原文件 + 缩略图落到
  // `<LibraryDirectoryPath>/users/<uid>/outbox/<client_message_id>/`，
  // 让重启 / 失败 / 离线场景下气泡始终有缩略图可显，且失败重试不需要
  // 重新选择文件。outbox 根路径随 accountNamespace 切换。
  attachmentStore: new MobileOutboxStore(),
  onUserBound: async (uid: string) => {
    const active = getActiveSession();
    runtimeLog.info("onUserBound", {
      uid,
      hadSession: Boolean(active),
      sessionChanged: active?.uid !== uid
    });
    if (active && active.uid !== uid) {
      teardownActiveSession();
    }
    if (!getActiveSession()) {
      const next = createSessionForUser(uid);
      setActiveSession(next);
      next.unauthorizedHandlers.add(async () => {
        await mobileAppController.handleUnauthorizedSession();
      });
      // NOTE: accountNamespace.set(uid) used to live here. It has been
      // moved to onLoginCommitted below so the cold-start launcher only
      // sees a persisted uid after login()'s bindUser + persistTokens
      // have landed. The crash-safety invariant is "namespace must
      // never point at a uid whose authStore was never written" — that
      // is satisfied as soon as persistTokens completes, which is why
      // onLoginCommitted now fires before bootstrap() rather than
      // after it (see controller.login() for the rationale).
      // The cold-start rebind path (useMobileRuntimeEffects.bootstrap)
      // doesn't need to re-set the namespace here either — it's already
      // the value we read on launch.
    }
    return {
      authStore: bootAuthStore,
      checkpoints: bootCheckpointStore,
      repository: bootRepository
    };
  },
  onLoginCommitted: async (uid: string) => {
    runtimeLog.info("onLoginCommitted", { uid });
    // Atomic "this uid is the cold-start entry" marker. Fires from
    // controller.login() after bindUser + persistTokens have landed
    // but before bootstrap() runs, so the AppContent key swap from
    // "anon" → uid happens while the UI is still on AuthScreen /
    // skeleton (no visible full-tree remount after Home renders).
    // See the matching note in onUserBound.
    accountNamespace.set(uid);
  },
  onUserUnbound: async (options: { wipeLocalData: boolean }) => {
    const uid = getActiveSession()?.uid ?? accountNamespace.get();
    runtimeLog.info("onUserUnbound", {
      uid,
      wipeLocalData: options.wipeLocalData
    });
    teardownActiveSession();
    accountNamespace.set(null);

    // 清空附件自愈 / 预刷新缓存：跨账号的 upload_id 不应复用上一个账号
    // 拿到的 presigned URL；conversationPreRefreshedAt 也必须清，否则
    // 新账号下"同名" conversation id 会被误判为"刚刷新过"而跳过预刷新。
    // 不依赖 wipeLocalData——即使保留本地数据也要清进程内缓存。
    // lazy dynamic import 避开循环依赖（refresh-attachment-urls 反向
    // import mobileServerApi）。
    try {
      const refreshModule = await import("./refresh-attachment-urls");
      refreshModule.resetMobileAttachmentRefreshCache();
    } catch (err) {
      runtimeLog.warn("resetMobileAttachmentRefreshCache failed", err);
      // ignore: 清理失败不应阻断 logout
    }

    // Presence subscriber 是模块级单例，realtime client 通过 Proxy 切换；
    // 这里 reset() 清空订阅集合但不解绑 onMessage/onReconnected listener，
    // 下次 bindUser 后新会话直接复用。lazy dynamic import 避开循环依赖
    // （presence-subscriber 反向 import mobileRealtimeClient）。
    try {
      const presenceModule = await import("./presence-subscriber");
      presenceModule.mobilePresenceSubscriber.reset();
    } catch (err) {
      runtimeLog.warn("presence reset failed", err);
      // ignore: presence 模块未加载或 reset 失败都不应阻断 logout
    }

    if (options.wipeLocalData) {
      // Wipe 路径下尝试在 OS 层撤销 push token，避免下一个登录用户继承
      // 上一个账号的推送绑定；失败一律吞掉，保持 logout best-effort。
      await deleteUnifiedPushToken().catch(err => {
        runtimeLog.warn("deleteUnifiedPushToken failed", err);
      });
      mobileDeviceInfo.pushToken = null;
      mobileDeviceInfo.pushAppId = null;
      mobileDeviceInfo.pushProvider = null;
      mobileDeviceInfo.pushCapabilities = [];
    }

    if (uid && options.wipeLocalData) {
      runtimeLog.info("wiping local data", { uid });
      dropUserStorageCache(uid, { clearDisk: true });
      dropMobileSQLiteForUser(uid);
      const mediaRoot = `${RNFS.CachesDirectoryPath}/users/${uid}/media`;
      const libraryBase =
        (RNFS as unknown as { LibraryDirectoryPath?: string })
          .LibraryDirectoryPath ?? RNFS.DocumentDirectoryPath;
      const outboxRoot = `${libraryBase}/users/${uid}/outbox`;
      const results = await Promise.allSettled([
        RNFS.unlink(mediaRoot).catch(() => undefined),
        RNFS.unlink(outboxRoot).catch(() => undefined)
      ]);
      const failed = results.filter(r => r.status === "rejected").length;
      if (failed > 0) {
        runtimeLog.warn("wipe local data partial failure", { failed });
      }
    }
  },
  // Hook fired when the realtime path lands a brand-new, *incoming* chat
  // message. Bridges to the Notifee-backed notification center so the
  // user gets a heads-up banner exactly when WhatsApp/Telegram would —
  // i.e. anytime the app is not already showing the conversation in the
  // foreground (subject to mute / quiet-hours / mention-only / preview
  // preferences applied inside notification-center).
  onIncomingChatMessage: ctx => {
    void dispatchIncomingChatMessageNotification(ctx);
  }
});

// Register the controller so `runtime/session.ts`'s realtime
// `onServerMessage` callback can dispatch events without forming an
// import cycle with this barrel.
registerController(mobileAppController);

/**
 * Bind the runtime to a specific user. Called from the cold-start path
 * after reading the persisted uid (so `controller.bootstrap()` resolves
 * the right account's data) and indirectly by `controller.login()` /
 * `controller.register()` via the `onUserBound` hook above.
 */
export async function bindMobileUserSession(uid: string) {
  runtimeLog.info("bindMobileUserSession", { uid });
  await mobileAppController.bindUser(uid);
}

/**
 * Tear down the active session. `wipeLocalData` is set from the logout
 * UI's optional "also clear local chat history" checkbox; when omitted
 * the per-user MMKV / SQLite / media data survives so the user can log
 * back in without re-syncing the world.
 */
export async function unbindMobileUserSession(options?: {
  wipeLocalData?: boolean;
}) {
  runtimeLog.info("unbindMobileUserSession", {
    wipeLocalData: options?.wipeLocalData === true
  });
  await mobileAppController.logout({
    wipeLocalData: options?.wipeLocalData === true
  });
}

// Re-export public surface from runtime submodules so the existing 27+
// importers of `services/app-runtime` keep resolving the same symbols.
export {
  mobileDeviceId,
  mobileApiBaseUrl,
  mobileWsUrl,
  mobileDeviceInfo,
  getMobilePushDeviceState,
  updateMobilePushRegistration,
  ensureMobileDeviceInfoReady
} from "./runtime/device-identity";
export { mobileServerApi, mobileRealtimeClient } from "./runtime/api-proxy";
export {
  uploadMobileFile,
  uploadMobileAvatarFile,
  ensureMobileFreshAccessToken,
  registerCurrentMobileDevice
} from "./runtime/uploads";
