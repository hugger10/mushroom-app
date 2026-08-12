import test from "node:test";
import assert from "node:assert/strict";
import { ApiError, createApiTransport } from "../dist/api/index.mjs";

function createJsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

test("createApiTransport retries once after refreshing the access token", async () => {
  let accessToken = "old-token";
  let refreshCalls = 0;
  const authorizations = [];

  const transport = createApiTransport({
    baseURL: "https://example.com",
    getAccessToken: () => accessToken,
    refreshAccessToken: async () => {
      refreshCalls += 1;
      accessToken = "new-token";
      return accessToken;
    },
    fetchImpl: async (_url, options) => {
      authorizations.push(options.headers.get("Authorization"));

      if (authorizations.length === 1) {
        return createJsonResponse(
          {
            code: 401,
            success: false,
            message: "access token expired",
            data: null,
            timestamp: Date.now()
          },
          401
        );
      }

      return createJsonResponse(
        {
          code: 0,
          success: true,
          message: null,
          data: {
            ok: true
          },
          timestamp: Date.now()
        },
        200
      );
    }
  });

  const result = await transport.get("/auth/profile");

  assert.equal(refreshCalls, 1);
  assert.deepEqual(authorizations, ["Bearer old-token", "Bearer new-token"]);
  assert.deepEqual(result.data, { ok: true });
});

test("createApiTransport calls onUnauthorized when refresh cannot recover", async () => {
  let unauthorizedCalls = 0;
  let errorCalls = 0;

  const transport = createApiTransport({
    baseURL: "https://example.com",
    getAccessToken: () => "expired-token",
    refreshAccessToken: async () => null,
    onUnauthorized: async () => {
      unauthorizedCalls += 1;
    },
    onError: async () => {
      errorCalls += 1;
    },
    fetchImpl: async () =>
      createJsonResponse(
        {
          code: 401,
          success: false,
          message: "session revoked",
          data: null,
          timestamp: Date.now()
        },
        401
      )
  });

  await assert.rejects(
    () => transport.get("/auth/profile"),
    error => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, 401);
      assert.equal(error.message, "session revoked");
      return true;
    }
  );

  assert.equal(unauthorizedCalls, 1);
  assert.equal(errorCalls, 1);
});

test("createApiTransport never refreshes recursively for /auth/refresh", async () => {
  let refreshCalls = 0;
  let unauthorizedCalls = 0;

  const transport = createApiTransport({
    baseURL: "https://example.com",
    getAccessToken: () => "expired-token",
    refreshAccessToken: async () => {
      refreshCalls += 1;
      return "new-token";
    },
    onUnauthorized: async () => {
      unauthorizedCalls += 1;
    },
    fetchImpl: async () =>
      createJsonResponse(
        {
          code: 401,
          success: false,
          message: "refresh token expired",
          data: null,
          timestamp: Date.now()
        },
        401
      )
  });

  await assert.rejects(
    () => transport.post("/auth/refresh"),
    error => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.message, "refresh token expired");
      return true;
    }
  );

  assert.equal(refreshCalls, 0);
  assert.equal(unauthorizedCalls, 1);
});

test("createApiTransport surfaces the original 401 without clearing the session when refresh throws transient errors", async () => {
  let refreshCalls = 0;
  let unauthorizedCalls = 0;

  const transport = createApiTransport({
    baseURL: "https://example.com",
    getAccessToken: () => "expired-token",
    refreshAccessToken: async () => {
      refreshCalls += 1;
      throw new Error("network down");
    },
    onUnauthorized: async () => {
      unauthorizedCalls += 1;
    },
    fetchImpl: async () =>
      createJsonResponse(
        {
          code: 401,
          success: false,
          message: "access token expired",
          data: null,
          timestamp: Date.now()
        },
        401
      )
  });

  await assert.rejects(
    () => transport.get("/auth/profile"),
    error => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, 401);
      return true;
    }
  );

  assert.equal(refreshCalls, 1);
  // Transient refresh failure (not an ApiError 401/403): do not clear the
  // local session via onUnauthorized; let the caller see the original 401.
  assert.equal(unauthorizedCalls, 0);
});

test("createApiTransport calls onUnauthorized when refresh throws an explicit 401", async () => {
  let refreshCalls = 0;
  let unauthorizedCalls = 0;

  const transport = createApiTransport({
    baseURL: "https://example.com",
    getAccessToken: () => "expired-token",
    refreshAccessToken: async () => {
      refreshCalls += 1;
      throw new ApiError("Refresh token is invalid", { status: 401 });
    },
    onUnauthorized: async () => {
      unauthorizedCalls += 1;
    },
    fetchImpl: async () =>
      createJsonResponse(
        {
          code: 401,
          success: false,
          message: "access token expired",
          data: null,
          timestamp: Date.now()
        },
        401
      )
  });

  await assert.rejects(
    () => transport.get("/auth/profile"),
    error => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, 401);
      return true;
    }
  );

  assert.equal(refreshCalls, 1);
  assert.equal(unauthorizedCalls, 1);
});
