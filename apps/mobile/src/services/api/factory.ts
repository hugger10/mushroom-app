import {
  buildLoginUserFromAccessToken,
  type AuthSessionStore
} from "@mushroom/app-core";
import { ApiError, createMushroomApi } from "@mushroom/shared";

export function normalizeBaseURL(baseURL: string) {
  return baseURL.replace(/\/$/, "");
}

/**
 * 生成客户端幂等键（UUIDv4 风格）。RN 默认运行时缺少 crypto.randomUUID，
 * 这里优先使用平台提供的 `globalThis.crypto.randomUUID`，否则退化为基于
 * Math.random 的伪随机字符串。该 id 只用于"同一次用户操作的多次网络请求"
 * 去重，对碰撞概率的要求远低于密码学场景，因此 fallback 已足够。
 */
function generateClientRequestId(): string {
  const cryptoRef = (globalThis as { crypto?: { randomUUID?: () => string } })
    .crypto;
  if (cryptoRef?.randomUUID) {
    try {
      return cryptoRef.randomUUID();
    } catch {
      // fallthrough
    }
  }
  // RFC4122-ish v4 fallback
  const r = () =>
    Math.floor(Math.random() * 0x10000)
      .toString(16)
      .padStart(4, "0");
  return `${r()}${r()}-${r()}-4${r().slice(1)}-${(Math.floor(Math.random() * 4) + 8).toString(16)}${r().slice(1)}-${r()}${r()}${r()}`;
}

interface MobileServerApiCacheEntry {
  api: ReturnType<typeof createMushroomApi>;
  authStore: AuthSessionStore;
  unauthorizedHandlers: Set<() => Promise<void> | void>;
  refreshAccessToken: () => Promise<string | null>;
}

const mobileServerApiCache = new Map<string, MobileServerApiCacheEntry>();

/** 内部访问器：供同包 token.ts 复用 cache 条目（共享 single-flight 状态）。 */
export function getMobileServerApiCacheEntry(
  normalizedBaseURL: string
): MobileServerApiCacheEntry | undefined {
  return mobileServerApiCache.get(normalizedBaseURL);
}

export function createMobileServerApi(options: {
  baseURL: string;
  authStore: AuthSessionStore;
  onUnauthorized?: () => Promise<void> | void;
}) {
  const normalizedBaseURL = normalizeBaseURL(options.baseURL);

  // Memoize per (baseURL + authStore) so that ad-hoc helpers like
  // `uploadMobileAttachment` reuse the same transport instance — and
  // therefore the same single-flight refresh + post-refresh cooldown — as
  // the long-lived `mobileServerApi` exported from `app-runtime`. Without
  // memoization each helper would create a fresh transport whose internal
  // `inflightRefresh` / `lastRefreshAt` state is empty, defeating the
  // dedupe and re-introducing the 401 storm on access_jti rotation.
  const cached = mobileServerApiCache.get(normalizedBaseURL);
  if (cached) {
    if (cached.authStore !== options.authStore) {
      // Fail-fast: a different AuthSessionStore reusing the same baseURL
      // would silently overwrite the prior cache entry, leaving the
      // previous transport's `inflightRefresh` / `lastRefreshAt` state
      // unreachable to new callers and re-introducing the 401 storm we
      // memoized to prevent. The current architecture assumes a single
      // long-lived authStore per baseURL (see `app-runtime.ts`), so a
      // mismatch indicates a programming error.
      throw new Error(
        `createMobileServerApi: authStore mismatch for baseURL "${normalizedBaseURL}"`
      );
    }
    if (options.onUnauthorized) {
      cached.unauthorizedHandlers.add(options.onUnauthorized);
    }
    return cached.api;
  }

  // Single-flight refresh: when several in-flight requests hit 401 around
  // the same time, all of them should await the *same* refresh attempt
  // instead of issuing concurrent /auth/refresh calls (which previously
  // caused server-side 401 storms because only the first one matches the
  // current refresh_token_hash). Mirrors the dedupe used by web/electron
  // bundles.
  let inflightRefresh: Promise<string | null> | null = null;
  const unauthorizedHandlers = new Set<() => Promise<void> | void>();
  if (options.onUnauthorized) {
    unauthorizedHandlers.add(options.onUnauthorized);
  }

  const performRefresh = async (): Promise<string | null> => {
    const auth = await options.authStore.read();
    if (!auth.refreshToken) {
      return null;
    }

    const refreshClient = createMushroomApi({
      baseURL: normalizedBaseURL
    });

    try {
      const result = await refreshClient.refreshTokens({
        refresh_token: auth.refreshToken
      });
      const nextUser = buildLoginUserFromAccessToken({
        accessToken: result.data.access_token,
        refreshToken: result.data.refresh_token
      });
      await options.authStore.write({
        ...auth,
        accessToken: result.data.access_token,
        refreshToken: result.data.refresh_token,
        user:
          nextUser ??
          (auth.user
            ? {
                ...auth.user,
                access_token: result.data.access_token,
                refresh_token: result.data.refresh_token ?? undefined
              }
            : null)
      });
      return result.data.access_token;
    } catch (error) {
      // Distinguish between "session is gone" (401/403) and transient
      // failures (network error, 5xx, timeout). Only the former should
      // clear the local session and let the shared transport invoke
      // onUnauthorized; transient failures are re-thrown so the shared
      // transport can preserve the original 401 for the caller without
      // logging the user out.
      const status = error instanceof ApiError ? (error.status ?? null) : null;
      if (status === 401 || status === 403) {
        await options.authStore.clear();
        return null;
      }
      throw error;
    }
  };

  const refreshAccessToken = async () => {
    if (!inflightRefresh) {
      inflightRefresh = performRefresh().finally(() => {
        inflightRefresh = null;
      });
    }
    return inflightRefresh;
  };

  const api = createMushroomApi({
    baseURL: normalizedBaseURL,
    getAccessToken: async () => {
      const auth = await options.authStore.read();
      return auth.accessToken;
    },
    refreshAccessToken,
    generateClientRequestId: generateClientRequestId,
    onUnauthorized: async () => {
      await options.authStore.clear();
      for (const handler of unauthorizedHandlers) {
        await handler();
      }
    }
  });

  mobileServerApiCache.set(normalizedBaseURL, {
    api,
    authStore: options.authStore,
    unauthorizedHandlers,
    refreshAccessToken
  });

  return api;
}

/**
 * Drop the memoized API transport entries. Called by `app-runtime` when the
 * active user changes (login / logout / cold-start bind), because the
 * cached entry is keyed only by baseURL and would otherwise reject a new
 * authStore for the same baseURL with an "authStore mismatch" error.
 */
export function resetMobileServerApiCache() {
  mobileServerApiCache.clear();
}
