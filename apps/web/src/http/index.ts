import { i18n } from "../i18n";
import { message } from "antd";
import type { ApiResult, LoginResponse } from "@mushroom/shared";
import { ApiError, createMushroomApi } from "@mushroom/shared";
import {
  deleteTokens,
  getAccessToken,
  getRefreshToken,
  parseJwt,
  saveTokens
} from "../utils/token";

let refreshInFlight: Promise<string | null> | null = null;
let proactiveRefreshTimer: number | null = null;

const ACCESS_TOKEN_REFRESH_LEAD_MS = 5 * 60 * 1000;
const ACCESS_TOKEN_REFRESH_MIN_DELAY_MS = 5 * 1000;

function clearProactiveRefreshTimer() {
  if (proactiveRefreshTimer !== null) {
    window.clearTimeout(proactiveRefreshTimer);
    proactiveRefreshTimer = null;
  }
}

function getAccessTokenExpiryMs(token: string) {
  const payload = parseJwt(token);
  const expiresAtSeconds = Number(payload?.exp);
  if (!Number.isFinite(expiresAtSeconds) || expiresAtSeconds <= 0) {
    return null;
  }
  return expiresAtSeconds * 1000;
}

export function isAccessTokenExpiringSoon(
  token: string,
  withinMs = ACCESS_TOKEN_REFRESH_LEAD_MS
) {
  const expiresAtMs = getAccessTokenExpiryMs(token);
  if (!expiresAtMs) {
    return false;
  }

  return expiresAtMs - Date.now() <= withinMs;
}

export function stopProactiveTokenRefresh() {
  clearProactiveRefreshTimer();
}

export async function scheduleProactiveTokenRefresh(
  tokenOverride?: string | null
) {
  clearProactiveRefreshTimer();

  const token = tokenOverride ?? (await getAccessToken());
  if (!token) {
    return;
  }

  const expiresAtMs = getAccessTokenExpiryMs(token);
  if (!expiresAtMs) {
    return;
  }

  const delayMs = Math.max(
    expiresAtMs - Date.now() - ACCESS_TOKEN_REFRESH_LEAD_MS,
    ACCESS_TOKEN_REFRESH_MIN_DELAY_MS
  );

  proactiveRefreshTimer = window.setTimeout(() => {
    void refreshAccessToken();
  }, delayMs);
}

export async function refreshAccessToken() {
  if (refreshInFlight) {
    return refreshInFlight;
  }

  refreshInFlight = (async () => {
    const refreshToken = await getRefreshToken();
    if (!refreshToken) {
      return null;
    }

    const response = await fetch(
      `${import.meta.env.VITE_API_BASE_URL || "/api"}/auth/refresh`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          refresh_token: refreshToken
        })
      }
    );

    const result = (await response.json()) as ApiResult<LoginResponse>;
    if (!response.ok || !result.success || result.code !== 0 || !result.data) {
      throw new ApiError(result.message ?? "Token refresh failed", {
        status: response.status,
        code: result.code,
        result
      });
    }

    await saveTokens({
      accessToken: result.data.access_token,
      refreshToken: result.data.refresh_token
    });
    await scheduleProactiveTokenRefresh(result.data.access_token);

    return result.data.access_token;
  })()
    .catch(async () => {
      stopProactiveTokenRefresh();
      await deleteTokens();
      return null;
    })
    .finally(() => {
      refreshInFlight = null;
    });

  return refreshInFlight;
}

export const webServerApi = createMushroomApi({
  baseURL: import.meta.env.VITE_API_BASE_URL || "/api",
  getAccessToken,
  refreshAccessToken,
  generateClientRequestId: () =>
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
  onUnauthorized: async () => {
    const [accessToken, refreshToken] = await Promise.all([
      getAccessToken(),
      getRefreshToken()
    ]);
    if (!accessToken && !refreshToken) {
      stopProactiveTokenRefresh();
      return;
    }

    message.error(i18n.t("errorMessage.sessionExpired"));
    stopProactiveTokenRefresh();
    await deleteTokens();
    // Electron 端：让主进程一并关闭 DB / 清理 partition / 重建 anon 窗口；
    // wipeLocalData=false 保留本地数据，方便用户重新登录后恢复。
    if (window.electronAPI?.logoutUser) {
      try {
        await window.electronAPI.logoutUser({ wipeLocalData: false });
      } catch {
        /* ignore */
      }
    }
  },
  onError: (errorMessage, error) => {
    if (error.status === 401 || error.status === 403) {
      return;
    }
    message.error(errorMessage || i18n.t("api.requestFailed"));
  }
});

export default webServerApi;
