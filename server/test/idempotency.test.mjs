import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const idempotencyHandler = require("../dist/server/src/handler/idempotency.js");
const idempotencyRepoModule = require("../dist/server/src/repository/idempotency_repository.js");

const { idempotency } = idempotencyHandler;
const idempotencyRepository =
  idempotencyRepoModule.default ?? idempotencyRepoModule.idempotencyRepository;

const originalFindOne = idempotencyRepository.findOne.bind(
  idempotencyRepository
);
const originalInsert = idempotencyRepository.insert.bind(idempotencyRepository);

function mockRepo({ findOne, insert } = {}) {
  idempotencyRepository.findOne = findOne ?? (async () => null);
  idempotencyRepository.insert = insert ?? (async () => true);
}

function restoreRepo() {
  idempotencyRepository.findOne = originalFindOne;
  idempotencyRepository.insert = originalInsert;
}

function buildReq({
  method = "POST",
  path = "/conversation/create",
  body = {},
  userId = 1
} = {}) {
  return {
    method,
    path,
    body,
    JwtPayload: userId ? { userId } : undefined
  };
}

function buildRes() {
  const res = {
    statusCode: 200,
    _jsonPayload: undefined,
    _sentResult: undefined
  };
  res.status = function (code) {
    res.statusCode = code;
    return res;
  };
  res.json = function (payload) {
    res._jsonPayload = payload;
    return res;
  };
  res.sendResult = function (result) {
    res._sentResult = result;
    return res;
  };
  return res;
}

function nextSpy() {
  const fn = function (...args) {
    fn.called = true;
    fn.args = args;
  };
  fn.called = false;
  return fn;
}

test.afterEach(() => {
  restoreRepo();
});

test("idempotency: 同 key 命中后回放缓存响应", async () => {
  let insertCalls = 0;
  mockRepo({
    findOne: async () => ({
      user_id: "1",
      method: "POST",
      path: "/conversation/create",
      client_request_id: "key-1",
      request_hash: "",
      status_code: 201,
      response_body: { ok: true, replayed: true },
      created_at: new Date(),
      expires_at: new Date(Date.now() + 1000 * 60)
    }),
    insert: async () => {
      insertCalls++;
      return true;
    }
  });
  // 让 hash 也匹配：传一个会 hash 出相同值的请求体 → 修正 findOne 返回 request_hash
  // hashBody 已升级为：剔除 client_request_id + 顶层 key 排序，
  // 测试侧需用相同算法计算 expectedHash。
  const crypto = await import("node:crypto");
  const body = { name: "g", client_request_id: "key-1" };
  const filtered = {};
  for (const k of Object.keys(body).sort()) {
    if (k === "client_request_id") continue;
    filtered[k] = body[k];
  }
  const expectedHash = crypto
    .createHash("sha256")
    .update(JSON.stringify(filtered))
    .digest("hex");

  idempotencyRepository.findOne = async () => ({
    user_id: "1",
    method: "POST",
    path: "/conversation/create",
    client_request_id: "key-1",
    request_hash: expectedHash,
    status_code: 201,
    response_body: { ok: true, replayed: true },
    created_at: new Date(),
    expires_at: new Date(Date.now() + 1000 * 60)
  });

  const mw = idempotency({ paths: ["/conversation/create"] });
  const req = buildReq({ body });
  const res = buildRes();
  const next = nextSpy();

  await mw(req, res, next);

  assert.equal(next.called, false, "命中缓存时不应继续 next()");
  assert.equal(res.statusCode, 201);
  assert.deepEqual(res._jsonPayload, { ok: true, replayed: true });
  assert.equal(insertCalls, 0, "命中缓存时不应再写入");
});

test("idempotency: 同 key 不同 body 返回 409 IDEMPOTENCY_CONFLICT", async () => {
  mockRepo({
    findOne: async () => ({
      user_id: "1",
      method: "POST",
      path: "/conversation/create",
      client_request_id: "key-1",
      request_hash: "different-hash",
      status_code: 200,
      response_body: { ok: true },
      created_at: new Date(),
      expires_at: new Date(Date.now() + 1000 * 60)
    })
  });

  const mw = idempotency({ paths: ["/conversation/create"] });
  const req = buildReq({ body: { name: "x", client_request_id: "key-1" } });
  const res = buildRes();
  const next = nextSpy();

  await mw(req, res, next);

  assert.equal(next.called, false);
  assert.equal(res.statusCode, 409);
  assert.ok(res._sentResult, "应通过 sendResult 返回冲突响应");
  assert.equal(res._sentResult.code, 409);
  assert.equal(res._sentResult.success, false);
  assert.equal(res._sentResult.data?.reason, "idempotency_conflict");
});

test("idempotency: 未携带 client_request_id 时直接放行", async () => {
  let findOneCalled = false;
  mockRepo({
    findOne: async () => {
      findOneCalled = true;
      return null;
    }
  });

  const mw = idempotency({ paths: ["/conversation/create"] });
  const req = buildReq({ body: { name: "g" } });
  const res = buildRes();
  const next = nextSpy();

  await mw(req, res, next);

  assert.equal(findOneCalled, false, "无 key 时不应查表");
  assert.equal(next.called, true, "无 key 时应放行");
});

test("idempotency: 非白名单路径直接放行", async () => {
  let findOneCalled = false;
  mockRepo({
    findOne: async () => {
      findOneCalled = true;
      return null;
    }
  });

  const mw = idempotency({ paths: ["/conversation/create"] });
  const req = buildReq({
    path: "/some/other/endpoint",
    body: { client_request_id: "key-1" }
  });
  const res = buildRes();
  const next = nextSpy();

  await mw(req, res, next);

  assert.equal(findOneCalled, false);
  assert.equal(next.called, true);
});

test("idempotency: GET 等只读方法直接放行", async () => {
  let findOneCalled = false;
  mockRepo({
    findOne: async () => {
      findOneCalled = true;
      return null;
    }
  });

  const mw = idempotency({ paths: ["/conversation/create"] });
  const req = buildReq({
    method: "GET",
    body: { client_request_id: "key-1" }
  });
  const res = buildRes();
  const next = nextSpy();

  await mw(req, res, next);

  assert.equal(findOneCalled, false);
  assert.equal(next.called, true);
});

test("idempotency: 2xx 响应后异步缓存幂等记录", async () => {
  const inserts = [];
  mockRepo({
    findOne: async () => null,
    insert: async input => {
      inserts.push(input);
      return true;
    }
  });

  const mw = idempotency({ paths: ["/conversation/create"], ttlSeconds: 60 });
  const req = buildReq({ body: { name: "g", client_request_id: "key-1" } });
  const res = buildRes();
  const next = nextSpy();

  await mw(req, res, next);
  assert.equal(next.called, true, "未命中时应继续 next()");

  // 模拟下游业务返回 200 响应
  res.statusCode = 200;
  res.json({ code: 200, success: true, data: { id: "abc" } });

  // 等待 best-effort 异步写入完成
  await new Promise(r => setTimeout(r, 10));

  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].userId, 1);
  assert.equal(inserts[0].clientRequestId, "key-1");
  assert.equal(inserts[0].statusCode, 200);
  assert.equal(inserts[0].ttlSeconds, 60);
  assert.deepEqual(inserts[0].responseBody, {
    code: 200,
    success: true,
    data: { id: "abc" }
  });
});

test("idempotency: 非 2xx 响应不缓存", async () => {
  const inserts = [];
  mockRepo({
    findOne: async () => null,
    insert: async input => {
      inserts.push(input);
      return true;
    }
  });

  const mw = idempotency({ paths: ["/conversation/create"] });
  const req = buildReq({ body: { name: "g", client_request_id: "key-1" } });
  const res = buildRes();
  const next = nextSpy();

  await mw(req, res, next);
  assert.equal(next.called, true);

  // 模拟下游业务 500 错误
  res.statusCode = 500;
  res.json({ code: 500, success: false, message: "boom" });

  await new Promise(r => setTimeout(r, 10));

  assert.equal(inserts.length, 0, "5xx 响应不应被缓存");
});

test("idempotency: 仓库查询异常时降级放行", async () => {
  mockRepo({
    findOne: async () => {
      throw new Error("db down");
    }
  });

  const mw = idempotency({ paths: ["/conversation/create"] });
  const req = buildReq({ body: { name: "g", client_request_id: "key-1" } });
  const res = buildRes();
  const next = nextSpy();

  await mw(req, res, next);

  assert.equal(next.called, true, "中间件异常应降级，不阻塞业务");
});

test("idempotency: 缺少 JwtPayload.userId 时直接放行", async () => {
  let findOneCalled = false;
  mockRepo({
    findOne: async () => {
      findOneCalled = true;
      return null;
    }
  });

  const mw = idempotency({ paths: ["/conversation/create"] });
  const req = buildReq({ body: { client_request_id: "key-1" }, userId: 0 });
  const res = buildRes();
  const next = nextSpy();

  await mw(req, res, next);

  assert.equal(findOneCalled, false);
  assert.equal(next.called, true);
});
