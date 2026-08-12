jest.mock("@mushroom/shared", () => {
  const refreshTokens = jest.fn();
  const createMushroomApi = jest.fn(() => ({
    refreshTokens
  }));
  class ApiError extends Error {
    status?: number | null;
    constructor(message: string, options?: { status?: number | null }) {
      super(message);
      this.status = options?.status ?? null;
    }
  }
  return {
    __esModule: true,
    createMushroomApi,
    refreshTokensMock: refreshTokens,
    ApiError,
    DEFAULT_LIMITS_CONFIG: {
      attachments: {
        image: 30 * 1024 * 1024,
        video: 300 * 1024 * 1024,
        audio: 100 * 1024 * 1024,
        voice: 50 * 1024 * 1024,
        file: 200 * 1024 * 1024
      },
      upload: {
        chunkSize: 5 * 1024 * 1024,
        multipartThreshold: 5 * 1024 * 1024,
        concurrency: 3,
        maxRetries: 3,
        partUrlExpiresSec: 900
      },
      text: { maxLength: 2000 },
      avatar: { maxSize: 5 * 1024 * 1024 }
    },
    ATTACHMENT_CATEGORY_LABEL: {
      image: "图片",
      video: "视频",
      audio: "音频",
      voice: "语音",
      file: "文件"
    },
    MUSHROOM_DEFAULT_LANGUAGE: "zh-CN",
    MUSHROOM_LANGUAGE_LABELS: {
      "zh-CN": "简体中文",
      "en-US": "English"
    },
    mushroomI18nResources: {},
    resolveMushroomLanguage: () => "zh-CN",
    normalizeMushroomLanguage: (value: string | null) => value ?? null,
    getNextMushroomLanguage: (value: string) => value,
    bytesToMB: (b: number) => Math.round(b / 1024 / 1024),
    detectAttachmentCategory: () => "file",
    ChunkedUploader: class {
      upload() {
        return Promise.resolve({
          uploadId: "x",
          url: "https://example.com/x",
          objectName: "x",
          size: 0
        });
      }
    }
  };
});

jest.mock("@mushroom/app-core", () => ({
  __esModule: true,
  buildLoginUserFromAccessToken: jest.fn(() => null),
  isJwtExpired: jest.fn(() => false)
}));

import {
  createMushroomApi,
  // @ts-expect-error - exposed by the mock above
  refreshTokensMock,
  ApiError
} from "@mushroom/shared";
import { isJwtExpired } from "@mushroom/app-core";
import {
  createMobileServerApi,
  ensureFreshAccessToken
} from "../src/services/api";

type RefreshAccessToken = () => Promise<string | null>;

function createAuthStore(initial: {
  accessToken?: string | null;
  refreshToken?: string | null;
}) {
  const snapshot = {
    accessToken: initial.accessToken ?? null,
    refreshToken: initial.refreshToken ?? null,
    user: null
  };
  return {
    snapshot,
    read: jest.fn(async () => ({ ...snapshot })),
    write: jest.fn(async (next: typeof snapshot) => {
      Object.assign(snapshot, next);
    }),
    clear: jest.fn(async () => {
      snapshot.accessToken = null;
      snapshot.refreshToken = null;
      snapshot.user = null;
    })
  };
}

describe("createMobileServerApi refresh dedupe", () => {
  let baseUrlCounter = 0;
  const nextBaseUrl = () => `https://example-${++baseUrlCounter}.com`;

  beforeEach(() => {
    (createMushroomApi as jest.Mock).mockClear();
    refreshTokensMock.mockReset();
    (isJwtExpired as jest.Mock).mockReset();
    (isJwtExpired as jest.Mock).mockReturnValue(false);
  });

  test("collapses concurrent refreshes into a single /auth/refresh call", async () => {
    const authStore = createAuthStore({
      accessToken: "expired",
      refreshToken: "rt-1"
    });

    let resolveRefresh: ((value: unknown) => void) | null = null;
    refreshTokensMock.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveRefresh = resolve as (value: unknown) => void;
        })
    );

    createMobileServerApi({
      baseURL: nextBaseUrl(),
      authStore: authStore as never
    });

    // First call to createMushroomApi is the request transport itself.
    // Pull the refreshAccessToken passed into it and invoke it concurrently
    // five times, simulating five in-flight requests racing on a 401.
    const transportOptions = (createMushroomApi as jest.Mock).mock.calls[0][0];
    const refreshAccessToken: RefreshAccessToken =
      transportOptions.refreshAccessToken;

    const inflight = [
      refreshAccessToken(),
      refreshAccessToken(),
      refreshAccessToken(),
      refreshAccessToken(),
      refreshAccessToken()
    ];

    // Wait until performRefresh has actually invoked the underlying
    // /auth/refresh stub (microtask flush), then resolve it once for all
    // five callers.
    while (refreshTokensMock.mock.calls.length === 0) {
      await Promise.resolve();
    }
    expect(refreshTokensMock).toHaveBeenCalledTimes(1);

    resolveRefresh!({
      data: {
        access_token: "new-access",
        refresh_token: "new-refresh"
      }
    });

    const results = await Promise.all(inflight);

    expect(results).toEqual([
      "new-access",
      "new-access",
      "new-access",
      "new-access",
      "new-access"
    ]);
    expect(refreshTokensMock).toHaveBeenCalledTimes(1);
    expect(authStore.write).toHaveBeenCalledTimes(1);
  });

  test("clears the auth store and returns null when refresh hits 401", async () => {
    const authStore = createAuthStore({
      accessToken: "expired",
      refreshToken: "rt-stale"
    });

    refreshTokensMock.mockRejectedValue(
      new ApiError("Refresh token is invalid", { status: 401 })
    );

    createMobileServerApi({
      baseURL: nextBaseUrl(),
      authStore: authStore as never
    });

    const transportOptions = (createMushroomApi as jest.Mock).mock.calls[0][0];
    const refreshAccessToken: RefreshAccessToken =
      transportOptions.refreshAccessToken;

    const result = await refreshAccessToken();

    expect(result).toBeNull();
    expect(authStore.clear).toHaveBeenCalledTimes(1);
    expect(authStore.write).not.toHaveBeenCalled();
  });

  test("does not clear the auth store on transient network errors", async () => {
    const authStore = createAuthStore({
      accessToken: "expired",
      refreshToken: "rt-net"
    });

    refreshTokensMock.mockRejectedValue(new Error("network down"));

    createMobileServerApi({
      baseURL: nextBaseUrl(),
      authStore: authStore as never
    });

    const transportOptions = (createMushroomApi as jest.Mock).mock.calls[0][0];
    const refreshAccessToken: RefreshAccessToken =
      transportOptions.refreshAccessToken;

    // Transient failures must propagate so the shared transport can
    // decide to surface the original 401 rather than calling
    // onUnauthorized (which would clear the local session).
    await expect(refreshAccessToken()).rejects.toThrow("network down");
    expect(authStore.clear).not.toHaveBeenCalled();
    expect(authStore.write).not.toHaveBeenCalled();
  });

  test("memoizes per baseURL so helper transports share the inflightRefresh", async () => {
    const authStore = createAuthStore({
      accessToken: "expired",
      refreshToken: "rt-share"
    });

    let resolveRefresh: ((value: unknown) => void) | null = null;
    refreshTokensMock.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveRefresh = resolve as (value: unknown) => void;
        })
    );

    const baseURL = nextBaseUrl();
    const transportCallsBefore = (createMushroomApi as jest.Mock).mock.calls
      .length;

    const a = createMobileServerApi({
      baseURL,
      authStore: authStore as never
    });
    const b = createMobileServerApi({
      baseURL,
      authStore: authStore as never
    });

    // Second call returns the cached transport — no new createMushroomApi
    // invocation for the request transport itself.
    expect(a).toBe(b);
    // Only one new transport (the request transport for the first call).
    // The refresh client is created lazily inside performRefresh.
    expect(
      (createMushroomApi as jest.Mock).mock.calls.length - transportCallsBefore
    ).toBe(1);

    const transportOptions = (createMushroomApi as jest.Mock).mock.calls.at(
      -1
    )?.[0];
    const refreshAccessToken: RefreshAccessToken =
      transportOptions.refreshAccessToken;

    const inflight = [refreshAccessToken(), refreshAccessToken()];

    while (refreshTokensMock.mock.calls.length === 0) {
      await Promise.resolve();
    }
    expect(refreshTokensMock).toHaveBeenCalledTimes(1);

    resolveRefresh!({
      data: { access_token: "new-access", refresh_token: "new-refresh" }
    });

    const results = await Promise.all(inflight);
    expect(results).toEqual(["new-access", "new-access"]);
  });

  test("ensureFreshAccessToken refreshes when the persisted token is expired", async () => {
    const authStore = createAuthStore({
      accessToken: "expired",
      refreshToken: "rt-stale"
    });
    (isJwtExpired as jest.Mock).mockReturnValue(true);
    refreshTokensMock.mockResolvedValue({
      data: { access_token: "fresh", refresh_token: "fresh-rt" }
    });

    const result = await ensureFreshAccessToken({
      baseURL: nextBaseUrl(),
      authStore: authStore as never
    });

    expect(refreshTokensMock).toHaveBeenCalledTimes(1);
    expect(result).toBe("fresh");
    expect(authStore.write).toHaveBeenCalledTimes(1);
  });

  test("ensureFreshAccessToken skips refresh when the token is still valid", async () => {
    const authStore = createAuthStore({
      accessToken: "good",
      refreshToken: "rt"
    });
    (isJwtExpired as jest.Mock).mockReturnValue(false);

    const result = await ensureFreshAccessToken({
      baseURL: nextBaseUrl(),
      authStore: authStore as never
    });

    expect(refreshTokensMock).not.toHaveBeenCalled();
    expect(result).toBe("good");
  });

  test("ensureFreshAccessToken returns null when no session is persisted", async () => {
    const authStore = createAuthStore({
      accessToken: null,
      refreshToken: null
    });

    const result = await ensureFreshAccessToken({
      baseURL: nextBaseUrl(),
      authStore: authStore as never
    });

    expect(refreshTokensMock).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });
});
