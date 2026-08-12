import test from "node:test";
import assert from "node:assert/strict";

// 回归测试：node-postgres 默认把 BIGINT 列以 string 返回（保留 Snowflake 精度）。
// 我们在 minio.ts 中比较 record.uploader_id 与 JWT userId（number）时必须先做类型规范化，
// 否则任何 "1" !== 1 都会让 complete/abort 入口误判 "Upload not found"。
//
// 这组测试在不依赖 DB / pg 模块的前提下，锁住该规范化模式：

test("Number(stringId) bridges BIGINT-as-string with number userId", () => {
  const recordFromPg = { uploader_id: "1" }; // pg 默认 BIGINT 输出形态
  const jwtUserId = 1; // jwt.ts 中 normalizedPayload.userId 始终为 number
  assert.notStrictEqual(recordFromPg.uploader_id, jwtUserId); // 直接比较失败
  assert.strictEqual(Number(recordFromPg.uploader_id), jwtUserId); // 规范化后等价
});

test("Number(stringId) 在 BIGSERIAL 范围内可逆转换", () => {
  // users.id 来自 BIGSERIAL，从 1 自增；典型上限远小于 2^53-1。
  const samples = ["1", "42", "1000000", "9007199254740991"];
  for (const raw of samples) {
    const n = Number(raw);
    assert.ok(Number.isSafeInteger(n), `expected safe integer for ${raw}`);
    assert.strictEqual(String(n), raw);
  }
});

test("Number(snowflakeStringId) 会丢失精度——禁止用于 conversation/message ID 直接比较", () => {
  // Snowflake ID 长度 18 位、>= 1e17，超过 Number.MAX_SAFE_INTEGER (~9e15)。
  // 这条用例提醒后续维护者：不要把同样的 Number(...) 模式套到 conversations.id /
  // messages.conversation_id 等列上，否则会丢精度。
  const snowflake = "183938506416984064";
  const back = String(Number(snowflake));
  assert.notStrictEqual(back, snowflake);
});
