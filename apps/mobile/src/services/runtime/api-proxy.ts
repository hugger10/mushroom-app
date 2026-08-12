import { createMobileServerApi, resetMobileServerApiCache } from "../api";
import type { MobileRealtimeClient } from "../realtime";
import { mobileApiBaseUrl } from "./device-identity";
import { bootAuthStore, getActiveRealtime } from "./boot-stubs";
import { getActiveSession } from "./session-state";

let preAuthApi: ReturnType<typeof createMobileServerApi> | null = null;

export function getPreAuthApi(): ReturnType<typeof createMobileServerApi> {
  if (!preAuthApi) {
    // Pre-auth transport: used by `controller.login()` /
    // `controller.register()` / `refreshTokens()` calls that fire before
    // any user session is bound. The transport's authStore is the empty
    // bootAuthStore (read returns nulls; write/clear are no-ops while
    // `activeSession` is null), so it never persists tokens here — the
    // post-login flow rebinds and `persistTokens()` runs against the
    // real per-user authStore.
    preAuthApi = createMobileServerApi({
      baseURL: mobileApiBaseUrl,
      authStore: bootAuthStore
    });
  }
  return preAuthApi;
}

export function resetPreAuthApi(): void {
  preAuthApi = null;
}

export function resetAllApiCaches(): void {
  // The pre-auth API transport (used by login/register before any user is
  // bound) shares the same baseURL key in `mobileServerApiCache` as the
  // real per-user API. If we don't drop it here, `createMobileServerApi`
  // would detect the authStore mismatch and throw.
  resetMobileServerApiCache();
  preAuthApi = null;
}

export function getActiveApi(): ReturnType<typeof createMobileServerApi> {
  const active = getActiveSession();
  return active ? active.api : getPreAuthApi();
}

export const mobileServerApi = new Proxy(
  {} as ReturnType<typeof createMobileServerApi>,
  {
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
  }
);

export const mobileRealtimeClient = new Proxy({} as MobileRealtimeClient, {
  get(_target, prop) {
    const target = getActiveRealtime() as unknown as Record<
      string | symbol,
      unknown
    >;
    const value = target[prop];
    if (typeof value === "function") {
      return (value as (...args: unknown[]) => unknown).bind(
        getActiveRealtime()
      );
    }
    return value;
  }
});
