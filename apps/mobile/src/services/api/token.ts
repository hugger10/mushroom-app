import { isJwtExpired, type AuthSessionStore } from "@mushroom/app-core";
import {
  createMobileServerApi,
  getMobileServerApiCacheEntry,
  normalizeBaseURL
} from "./factory";

/**
 * Startup gate: if the persisted access token is already expired (or close
 * enough to expiry per `isJwtExpired`'s default 30 s skew, intentionally
 * matching the server's `JWT_ACCESS_GRACE_SECONDS`), proactively refresh
 * before the app fans out parallel bootstrap requests. Reuses the same
 * single-flight refresh as in-flight 401s, so concurrent callers collapse.
 *
 * Returns the token that should be used (possibly the original one if no
 * refresh was needed) or `null` when no session is available / refresh
 * failed permanently.
 */
export async function ensureFreshAccessToken(options: {
  baseURL: string;
  authStore: AuthSessionStore;
}): Promise<string | null> {
  const normalizedBaseURL = normalizeBaseURL(options.baseURL);
  // Make sure the cache entry exists so we share the inflightRefresh state
  // with the regular request path.
  createMobileServerApi({
    baseURL: normalizedBaseURL,
    authStore: options.authStore
  });
  const entry = getMobileServerApiCacheEntry(normalizedBaseURL);
  if (!entry) return null;

  const auth = await options.authStore.read();
  if (!auth.accessToken) {
    return null;
  }
  if (!isJwtExpired(auth.accessToken)) {
    return auth.accessToken;
  }
  if (!auth.refreshToken) {
    // Access token is already expired and we have no refresh token to
    // recover; surface this as "no usable session" so callers don't
    // proceed with a stale Bearer that the server will reject.
    return null;
  }
  try {
    const refreshed = await entry.refreshAccessToken();
    return refreshed ?? null;
  } catch {
    // Transient failures (network, server) should not block startup; let
    // the regular request path handle 401s with its existing dedupe.
    // However, if the persisted token is already expired, returning it
    // would lie about freshness — return null and let the caller decide.
    return isJwtExpired(auth.accessToken) ? null : auth.accessToken;
  }
}
