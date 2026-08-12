import {
  createJsonBackedAuthSessionStore,
  createJsonBackedSyncCheckpointStore
} from "@mushroom/app-core";
import { createMobileServerApi } from "../api";
import { MobileRealtimeClient } from "../realtime";
import { getUserStorage, wrapAsKeyValueStorage } from "../../data/storage";
import { createSQLiteMobileDataRepository } from "../../data/sqlite-data-repository";
import {
  closeActiveMobileSQLiteConnection,
  openMobileSQLiteForUser
} from "../../data/sqlite-connection";
import log from "../../utils/log";
import {
  mobileApiBaseUrl,
  mobileDeviceId,
  mobileWsUrl
} from "./device-identity";
import { resetAllApiCaches } from "./api-proxy";
import {
  ActiveAccountSession,
  getActiveSession,
  setActiveSession
} from "./session-state";
import { getController } from "./controller-handle";

const runtimeLog = log.scope("runtime");

export function createSessionForUser(uid: string): ActiveAccountSession {
  runtimeLog.info("create session", { uid });
  resetAllApiCaches();

  const userStorage = wrapAsKeyValueStorage(getUserStorage(uid));
  const authStore = createJsonBackedAuthSessionStore({
    storage: userStorage,
    key: "auth"
  });
  const checkpoints = createJsonBackedSyncCheckpointStore({
    storage: userStorage,
    key: "sync-checkpoints"
  });
  const connection = openMobileSQLiteForUser(uid);
  const repository = createSQLiteMobileDataRepository({ connection });
  const unauthorizedHandlers = new Set<() => Promise<void> | void>();
  const api = createMobileServerApi({
    baseURL: mobileApiBaseUrl,
    authStore,
    onUnauthorized: async () => {
      for (const handler of unauthorizedHandlers) {
        await handler();
      }
    }
  });
  const realtime = new MobileRealtimeClient({
    url: mobileWsUrl,
    deviceId: mobileDeviceId,
    getAccessToken: async () => {
      const auth = await authStore.read();
      return auth.accessToken;
    },
    // 注意：WS 重连后的 syncNow 由 `useMobileRealtimeEffects` 的
    // status listener 触发（自带 accessToken / isLoggingOut 守卫，
    // 且与 AppState / 网络恢复触发点同层），这里不再重复触发，
    // 否则一次重连会并发跑两轮 runMobileSync。
    onServerMessage: async message => {
      await getController().handleRealtimeEvent(message);
    }
  });
  return {
    uid,
    authStore,
    checkpoints,
    repository,
    api,
    realtime,
    unauthorizedHandlers
  };
}

export function teardownActiveSession(): void {
  const active = getActiveSession();
  if (!active) {
    return;
  }
  runtimeLog.info("teardown session", { uid: active.uid });
  try {
    active.realtime.disconnect();
  } catch (err) {
    runtimeLog.warn("realtime disconnect failed during teardown", err);
    // best effort
  }
  active.unauthorizedHandlers.clear();
  closeActiveMobileSQLiteConnection();
  resetAllApiCaches();
  setActiveSession(null);
}

export function requireActiveSession(): ActiveAccountSession {
  const active = getActiveSession();
  if (!active) {
    throw new Error(
      "Mobile app runtime is not bound to any user. Call bindMobileUserSession(uid) first."
    );
  }
  return active;
}
