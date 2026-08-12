export type StoredTokens = {
  accessToken: string;
  refreshToken?: string | null;
};

const AUTH_TOKENS_CHANGED_EVENT = "mushroom-auth-tokens-changed";

export type AuthTokensChangedDetail = {
  accessToken: string | null;
  refreshToken: string | null;
};

function isElectronRuntime() {
  return !!window.electronAPI;
}

function emitAuthTokensChanged(detail: AuthTokensChangedDetail) {
  if (typeof window === "undefined") {
    return;
  }

  // Keep the electron main-process httpClient in sync with the renderer's
  // token state. The renderer drives all token rotation through the shared
  // transport (with refresh dedupe + cooldown); without this push, any
  // background HTTP call originating from the main process would still
  // carry a stale `Bearer` and trip the server's "Session has been
  // superseded" guard at startup. The setAccessToken IPC is intentionally
  // optional (`?.`) so older preload bundles and the plain-web build are
  // unaffected.
  if (isElectronRuntime()) {
    syncAccessTokenToMain(detail.accessToken);
  }

  window.dispatchEvent(
    new CustomEvent<AuthTokensChangedDetail>(AUTH_TOKENS_CHANGED_EVENT, {
      detail
    })
  );
}

export function parseJwt(token: string) {
  try {
    const payload = token.split(".")[1];
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(
      base64.length + ((4 - (base64.length % 4)) % 4),
      "="
    );
    const json = decodeURIComponent(
      atob(padded)
        .split("")
        .map(c => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

let lastSyncedAccessToken: string | null | undefined = undefined;

function syncAccessTokenToMain(token: string | null) {
  if (!isElectronRuntime()) return;
  if (lastSyncedAccessToken === token) return;
  lastSyncedAccessToken = token;
  const setAccessToken = window.electronAPI.setAccessToken;
  if (typeof setAccessToken === "function") {
    void setAccessToken(token);
  }
}

export async function getAccessToken() {
  if (isElectronRuntime()) {
    const token = await window.electronAPI.getToken();
    syncAccessTokenToMain(token ?? null);
    return token;
  }

  return localStorage.getItem("token");
}

export async function getRefreshToken() {
  if (isElectronRuntime()) {
    return window.electronAPI.getRefreshToken();
  }

  return localStorage.getItem("refresh_token");
}

export async function saveAccessToken(token: string) {
  if (isElectronRuntime()) {
    await window.electronAPI.saveToken(token);
    return;
  }

  localStorage.setItem("token", token);
}

export async function saveRefreshToken(token: string) {
  if (isElectronRuntime()) {
    await window.electronAPI.saveRefreshToken(token);
    return;
  }

  localStorage.setItem("refresh_token", token);
}

export async function saveTokens(tokens: StoredTokens) {
  await saveAccessToken(tokens.accessToken);
  if (tokens.refreshToken) {
    await saveRefreshToken(tokens.refreshToken);
  }
  emitAuthTokensChanged({
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken ?? null
  });
}

export async function deleteTokens() {
  if (isElectronRuntime()) {
    await window.electronAPI.deleteToken();
    await window.electronAPI.deleteRefreshToken();
  } else {
    localStorage.removeItem("token");
    localStorage.removeItem("refresh_token");
  }

  emitAuthTokensChanged({
    accessToken: null,
    refreshToken: null
  });
}

export function onAuthTokensChanged(
  listener: (detail: AuthTokensChangedDetail) => void
) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<AuthTokensChangedDetail>;
    listener(customEvent.detail);
  };

  window.addEventListener(AUTH_TOKENS_CHANGED_EVENT, handler);
  return () => {
    window.removeEventListener(AUTH_TOKENS_CHANGED_EVENT, handler);
  };
}

export async function getToken() {
  return getAccessToken();
}

export async function saveToken(token: string) {
  return saveAccessToken(token);
}

export async function deleteToken() {
  return deleteTokens();
}
