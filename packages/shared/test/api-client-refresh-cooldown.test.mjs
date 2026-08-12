import test from "node:test";
import assert from "node:assert/strict";
import { createApiTransport } from "../dist/api/index.mjs";

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function unauthorizedBody() {
  return {
    code: 401,
    success: false,
    message: "access token expired",
    data: null,
    timestamp: Date.now()
  };
}

function okBody(data = { ok: true }) {
  return {
    code: 0,
    success: true,
    message: null,
    data,
    timestamp: Date.now()
  };
}

test("cooldown: stale 401 retries with latest token without triggering a second refresh", async () => {
  let currentToken = "t1";
  let refreshCalls = 0;
  const authorizations = [];

  const transport = createApiTransport({
    baseURL: "https://example.com",
    refreshCooldownMs: 5000,
    getAccessToken: () => currentToken,
    refreshAccessToken: async () => {
      refreshCalls += 1;
      currentToken = `t${refreshCalls + 1}`;
      return currentToken;
    },
    fetchImpl: async (_url, options) => {
      const auth = options.headers.get("Authorization");
      authorizations.push(auth);
      // First request with t1 -> 401 (triggers a real refresh -> t2)
      // Retry with t2 -> 200
      // Second top-level request below: arrives with t2 (already-rotated
      // straggler perceived by server as superseded) -> 401, but
      // cooldown is active so we retry with the latest token (still t2)
      // and the server now returns 200 to confirm the path didn't issue
      // another refresh.
      if (auth === "Bearer t1") return jsonResponse(unauthorizedBody(), 401);
      if (authorizations.filter(a => a === "Bearer t2").length === 1) {
        // first t2 attempt = 200 (post-refresh retry)
        return jsonResponse(okBody({ phase: "first" }), 200);
      }
      if (authorizations.filter(a => a === "Bearer t2").length === 2) {
        // second top-level request, first attempt with t2 -> 401
        return jsonResponse(unauthorizedBody(), 401);
      }
      // cooldown retry with t2 -> 200
      return jsonResponse(okBody({ phase: "cooldown-retry" }), 200);
    }
  });

  const r1 = await transport.get("/profile");
  assert.equal(refreshCalls, 1);
  assert.deepEqual(r1.data, { phase: "first" });

  const r2 = await transport.get("/profile");
  // The cooldown branch must not have triggered another refresh.
  assert.equal(refreshCalls, 1);
  assert.deepEqual(r2.data, { phase: "cooldown-retry" });
});

test("cooldown: token already changed under us — retry with latest token, no refresh", async () => {
  // Simulate a peer request that just rotated the token between when we
  // captured ours and when our 401 came back.
  let currentToken = "old";
  let refreshCalls = 0;
  let calls = 0;

  const transport = createApiTransport({
    baseURL: "https://example.com",
    getAccessToken: () => currentToken,
    refreshAccessToken: async () => {
      refreshCalls += 1;
      return "should-not-be-called";
    },
    fetchImpl: async (_url, options) => {
      calls += 1;
      const auth = options.headers.get("Authorization");
      if (calls === 1) {
        // Before returning the 401, rotate the token as if a peer did it.
        currentToken = "fresh";
        assert.equal(auth, "Bearer old");
        return jsonResponse(unauthorizedBody(), 401);
      }
      assert.equal(auth, "Bearer fresh");
      return jsonResponse(okBody(), 200);
    }
  });

  const r = await transport.get("/profile");
  assert.equal(refreshCalls, 0);
  assert.equal(r.data?.ok, true);
});

test("cooldown: expired window allows a new refresh", async () => {
  let currentToken = "t1";
  let refreshCalls = 0;
  const authorizations = [];

  const transport = createApiTransport({
    baseURL: "https://example.com",
    refreshCooldownMs: 1, // expire almost immediately
    getAccessToken: () => currentToken,
    refreshAccessToken: async () => {
      refreshCalls += 1;
      currentToken = `t${refreshCalls + 1}`;
      return currentToken;
    },
    fetchImpl: async (_url, options) => {
      const auth = options.headers.get("Authorization");
      authorizations.push(auth);
      // Each top-level request: first attempt 401, retry OK.
      // authorizations grows: [t1, t2, t2, t3] across two requests.
      // odd indices = first attempts -> 401
      const isFirstAttempt = authorizations.length % 2 === 1;
      if (isFirstAttempt) return jsonResponse(unauthorizedBody(), 401);
      return jsonResponse(okBody(), 200);
    }
  });

  await transport.get("/profile");
  assert.equal(refreshCalls, 1);

  // Wait past the cooldown window.
  await new Promise(resolve => setTimeout(resolve, 10));

  await transport.get("/profile");
  // Cooldown expired: a fresh refresh must have been issued.
  assert.equal(refreshCalls, 2);
});
