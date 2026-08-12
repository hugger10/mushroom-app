import type { ApiResult } from "../types/api";

export class ApiError extends Error {
  status?: number;
  code?: number;
  result?: ApiResult<unknown> | null;

  constructor(
    message: string,
    options?: {
      status?: number;
      code?: number;
      result?: ApiResult<unknown> | null;
    }
  ) {
    super(message);
    this.name = "ApiError";
    this.status = options?.status;
    this.code = options?.code;
    this.result = options?.result ?? null;
  }
}

export type ApiRequestQuery = object;

export interface ApiTransportOptions {
  baseURL: string;
  getAccessToken?: () =>
    | Promise<string | null | undefined>
    | string
    | null
    | undefined;
  refreshAccessToken?: () =>
    | Promise<string | null | undefined>
    | string
    | null
    | undefined;
  onUnauthorized?: () => Promise<void> | void;
  onError?: (message: string, error: ApiError) => Promise<void> | void;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  defaultHeaders?: Record<string, string>;
  /**
   * After a successful refreshAccessToken() call, additional 401 responses
   * within this window will NOT trigger a new refresh — instead the request
   * is retried once with the latest token. This collapses the
   * "refresh-storm" pattern where several requests, each carrying a token
   * that just got rotated, sequentially trip the server's superseded check
   * and each independently issues yet another refresh. Single-flight
   * already collapses simultaneous refreshes; the cooldown additionally
   * collapses serially-arriving stragglers. Default 5000 ms.
   */
  refreshCooldownMs?: number;
  /**
   * 由调用方提供的客户端幂等键生成器（通常返回一个 UUIDv4）。
   * 当 mutating 请求（POST/PUT/PATCH/DELETE）的 body 是普通对象且未显式包含
   * `client_request_id` 字段时，transport 会自动把生成的 id 注入到 body。
   * 调用方若已在 body 中显式提供 `client_request_id`（推荐绑定到表单实例，
   * 跨重试稳定），会保留显式值，避免被覆盖。
   */
  generateClientRequestId?: () => string;
}

export interface ApiRequestOptions {
  query?: ApiRequestQuery;
  headers?: Record<string, string>;
  body?: unknown;
}

function getBrowserBaseUrl() {
  const runtimeLocation = (
    globalThis as {
      location?: {
        origin?: string;
        href?: string;
      };
    }
  ).location;

  if (!runtimeLocation) {
    return null;
  }

  return runtimeLocation.origin === "null"
    ? (runtimeLocation.href ?? null)
    : (runtimeLocation.origin ?? runtimeLocation.href ?? null);
}

function buildUrl(baseURL: string, path: string, query?: ApiRequestQuery) {
  const normalizedBaseURL = baseURL.replace(/\/$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const requestPath = `${normalizedBaseURL}${normalizedPath}`;
  const isAbsoluteBaseUrl = /^https?:\/\//i.test(normalizedBaseURL);
  const url = isAbsoluteBaseUrl
    ? new URL(requestPath)
    : new URL(requestPath, getBrowserBaseUrl() ?? "http://localhost");

  if (query) {
    for (const [key, value] of Object.entries(
      query as Record<string, unknown>
    )) {
      if (value === undefined || value === null) continue;
      url.searchParams.set(
        key,
        value instanceof Date ? value.toISOString() : String(value)
      );
    }
  }

  return isAbsoluteBaseUrl ? url.toString() : `${url.pathname}${url.search}`;
}

async function parseJsonResponse<T>(response: Response): Promise<T | null> {
  const text = await response.text();
  if (!text) return null;
  return JSON.parse(text) as T;
}

export function createApiTransport(options: ApiTransportOptions) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) {
    throw new Error("Fetch API is not available in the current runtime.");
  }

  const refreshCooldownMs = options.refreshCooldownMs ?? 5000;
  // Timestamp of the most recent successful refresh in this transport.
  // Used to skip a follow-up refresh when a stale request 401's just after
  // a peer request already rotated the token. See refreshCooldownMs above.
  let lastRefreshAt = 0;

  const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

  function maybeInjectClientRequestId(
    method: string,
    requestOptions: ApiRequestOptions
  ) {
    if (!options.generateClientRequestId) return;
    if (!MUTATING_METHODS.has(method)) return;
    const body = requestOptions.body;
    // 只处理普通对象 body：FormData / Blob / 数组 / 原始值不注入。
    if (
      body === undefined ||
      body === null ||
      typeof body !== "object" ||
      Array.isArray(body)
    ) {
      return;
    }
    if (typeof FormData !== "undefined" && body instanceof FormData) {
      return;
    }
    const record = body as Record<string, unknown>;
    if (
      typeof record.client_request_id === "string" &&
      record.client_request_id
    ) {
      return; // 调用方已显式提供
    }
    // 浅拷贝，避免污染调用方持有的对象；同时把生成的 id 持久化回
    // requestOptions.body，使 401-refresh 重试沿用同一个 id。
    const cloned = {
      ...record,
      client_request_id: options.generateClientRequestId()
    };
    requestOptions.body = cloned;
  }

  async function request<T>(
    method: string,
    path: string,
    requestOptions: ApiRequestOptions = {},
    allowAuthRefresh = true
  ): Promise<ApiResult<T>> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      options.timeoutMs ?? 100_000
    );

    try {
      maybeInjectClientRequestId(method, requestOptions);
      const url = buildUrl(options.baseURL, path, requestOptions.query);
      const headers = new Headers(options.defaultHeaders ?? {});

      if (requestOptions.body !== undefined) {
        headers.set("Content-Type", "application/json");
      }

      if (requestOptions.headers) {
        Object.entries(requestOptions.headers).forEach(([key, value]) => {
          headers.set(key, value);
        });
      }

      const token = await options.getAccessToken?.();
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }

      const response = await fetchImpl(url, {
        method,
        headers,
        body:
          requestOptions.body === undefined
            ? undefined
            : JSON.stringify(requestOptions.body),
        signal: controller.signal
      });

      const result = await parseJsonResponse<ApiResult<T>>(response);
      // Track whether a transient refresh failure occurred. If the refresh
      // attempt failed for reasons unrelated to the session being gone
      // (network error, server 5xx, etc.) we must NOT invoke
      // onUnauthorized — clearing the local session in that case would log
      // the user out on a flaky network. Only an explicit 401/403 (or a
      // missing refresh token, signalled by `null`) means "session gone".
      let skipUnauthorizedHandler = false;
      if (
        allowAuthRefresh &&
        (response.status === 401 || response.status === 403) &&
        path !== "/auth/refresh" &&
        options.refreshAccessToken
      ) {
        // Fast paths that avoid issuing a second refresh:
        //   (1) Token already changed under us (peer request just refreshed):
        //       just retry with the new token.
        //   (2) We are still inside the post-refresh cooldown window:
        //       trust that the cached token is fresh enough; retry once.
        const latestToken = (await options.getAccessToken?.()) ?? null;
        if (latestToken && token && latestToken !== token) {
          return request<T>(method, path, requestOptions, false);
        }
        if (
          lastRefreshAt > 0 &&
          Date.now() - lastRefreshAt < refreshCooldownMs &&
          latestToken
        ) {
          // Trade-off: by collapsing all 401s within the cooldown window
          // into a single retry without invoking refresh, we trade a
          // little extra latency on genuine session-loss (the retry will
          // also 401 and only then fall through to onUnauthorized) for
          // eliminating refresh storms after a successful rotation. The
          // net behavior on a truly revoked session is identical — one
          // extra round-trip before logout.
          return request<T>(method, path, requestOptions, false);
        }

        let refreshedToken: string | null = null;
        try {
          refreshedToken = (await options.refreshAccessToken()) ?? null;
        } catch (refreshError) {
          refreshedToken = null;
          const isSessionGone =
            refreshError instanceof ApiError &&
            (refreshError.status === 401 || refreshError.status === 403);
          if (!isSessionGone) {
            skipUnauthorizedHandler = true;
          }
        }
        if (refreshedToken) {
          lastRefreshAt = Date.now();
          return request<T>(method, path, requestOptions, false);
        }
        // Refresh attempt failed: either session is gone (fall through to
        // onUnauthorized) or it was transient (skipUnauthorizedHandler is
        // set, the original 401 will surface to the caller intact).
      }

      if (
        !skipUnauthorizedHandler &&
        (response.status === 401 || response.status === 403) &&
        options.onUnauthorized
      ) {
        await options.onUnauthorized();
      }

      if (!response.ok) {
        const error = new ApiError(
          result?.message ?? `Request failed with status ${response.status}`,
          {
            status: response.status,
            code: result?.code,
            result
          }
        );
        if (options.onError) {
          await options.onError(error.message, error);
        }
        throw error;
      }

      if (!result) {
        return {
          code: 0,
          success: true,
          message: null,
          timestamp: Date.now(),
          data: null as T
        };
      }

      if (result.code !== 0) {
        const error = new ApiError(result.message ?? "Request failed", {
          status: response.status,
          code: result.code,
          result
        });
        if (options.onError) {
          await options.onError(error.message, error);
        }
        throw error;
      }

      return result;
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    get<T>(path: string, requestOptions?: Omit<ApiRequestOptions, "body">) {
      return request<T>("GET", path, requestOptions);
    },
    post<T>(path: string, requestOptions?: ApiRequestOptions) {
      return request<T>("POST", path, requestOptions);
    },
    put<T>(path: string, requestOptions?: ApiRequestOptions) {
      return request<T>("PUT", path, requestOptions);
    },
    delete<T>(path: string, requestOptions?: Omit<ApiRequestOptions, "body">) {
      return request<T>("DELETE", path, requestOptions);
    }
  };
}
