import test from "node:test";
import assert from "node:assert/strict";
import { generateFakeWaveform, hashSeed, mulberry32 } from "../dist/index.mjs";

test("hashSeed is deterministic and varies by input", () => {
  assert.equal(hashSeed("abc"), hashSeed("abc"));
  assert.notEqual(hashSeed("abc"), hashSeed("abd"));
  assert.equal(typeof hashSeed(""), "number");
});

test("mulberry32 produces a stable sequence", () => {
  const a = mulberry32(123);
  const b = mulberry32(123);
  for (let i = 0; i < 10; i += 1) {
    assert.equal(a(), b());
  }
  const next = a();
  assert.ok(next >= 0 && next < 1);
});

test("generateFakeWaveform is deterministic for the same seed", () => {
  const opts = { seed: "msg-1", barCount: 28, durationSeconds: 5 };
  const first = generateFakeWaveform(opts);
  const second = generateFakeWaveform(opts);
  assert.equal(first.length, 28);
  assert.deepEqual(first, second);
});

test("generateFakeWaveform yields different shapes for different seeds", () => {
  const a = generateFakeWaveform({
    seed: "msg-a",
    barCount: 28,
    durationSeconds: 5
  });
  const b = generateFakeWaveform({
    seed: "msg-b",
    barCount: 28,
    durationSeconds: 5
  });
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff += Math.abs(a[i] - b[i]);
  }
  // Average per-bar L1 distance should be meaningfully > 0.
  assert.ok(
    diff / a.length > 0.05,
    `expected meaningful difference, got ${diff / a.length}`
  );
});

test("generateFakeWaveform values stay within [min, max]", () => {
  const values = generateFakeWaveform({
    seed: "voice-x",
    barCount: 28,
    durationSeconds: 8
  });
  for (const v of values) {
    assert.ok(Number.isFinite(v), `value should be finite: ${v}`);
    assert.ok(v >= 0.18 - 1e-9, `value below min: ${v}`);
    assert.ok(v <= 1 + 1e-9, `value above max: ${v}`);
  }
});

test("generateFakeWaveform respects custom min/max bounds", () => {
  const values = generateFakeWaveform({
    seed: "custom",
    barCount: 16,
    durationSeconds: 3,
    minValue: 0.3,
    maxValue: 0.8
  });
  assert.equal(values.length, 16);
  for (const v of values) {
    assert.ok(v >= 0.3 - 1e-9 && v <= 0.8 + 1e-9);
  }
});

test("generateFakeWaveform handles edge cases gracefully", () => {
  assert.deepEqual(
    generateFakeWaveform({ seed: "x", barCount: 0, durationSeconds: 1 }),
    []
  );
  // Empty seed should still produce a stable output (treated as "_").
  const a = generateFakeWaveform({
    seed: "",
    barCount: 8,
    durationSeconds: 1
  });
  const b = generateFakeWaveform({
    seed: "",
    barCount: 8,
    durationSeconds: 1
  });
  assert.deepEqual(a, b);
  assert.equal(a.length, 8);
});

test("generateFakeWaveform duration affects envelope shape", () => {
  const short = generateFakeWaveform({
    seed: "same-seed",
    barCount: 28,
    durationSeconds: 1
  });
  const long = generateFakeWaveform({
    seed: "same-seed",
    barCount: 28,
    durationSeconds: 30
  });
  let diff = 0;
  for (let i = 0; i < short.length; i += 1) {
    diff += Math.abs(short[i] - long[i]);
  }
  assert.ok(
    diff / short.length > 0.02,
    `expected duration to influence shape, got avg diff ${diff / short.length}`
  );
});

test("generateFakeWaveform quantizes heights to at most quantizeLevels values", () => {
  const levels = 8;
  const values = generateFakeWaveform({
    seed: "quant",
    barCount: 120,
    durationSeconds: 5,
    quantizeLevels: levels
  });
  const unique = new Set(values.map(v => Number(v.toFixed(6))));
  assert.ok(
    unique.size <= levels,
    `expected <= ${levels} distinct heights, got ${unique.size}`
  );
  for (const v of values) {
    assert.ok(Number.isFinite(v));
    assert.ok(v >= 0.18 - 1e-9 && v <= 1 + 1e-9);
  }
});

test("generateFakeWaveform quantization is deterministic and level-count driven", () => {
  const opts = { seed: "quant-2", barCount: 60, durationSeconds: 4 };
  const a = generateFakeWaveform({ ...opts, quantizeLevels: 5 });
  const b = generateFakeWaveform({ ...opts, quantizeLevels: 5 });
  assert.deepEqual(a, b);

  const coarseUnique = new Set(a.map(v => Number(v.toFixed(6)))).size;
  const fineUnique = new Set(
    generateFakeWaveform({ ...opts, quantizeLevels: 12 }).map(v =>
      Number(v.toFixed(6))
    )
  ).size;
  assert.ok(fineUnique > coarseUnique, "more levels should yield more heights");
});

test("generateFakeWaveform default output is scattered, not a smooth wave", () => {
  const values = generateFakeWaveform({
    seed: "scatter-check",
    barCount: 28,
    durationSeconds: 5
  });
  const step = (1 - 0.18) / 7; // 默认 8 档位、[0.18, 1] 区间下的单档高度
  let levelChanges = 0;
  let bigJumps = 0;
  for (let i = 1; i < values.length; i += 1) {
    const d = Math.abs(values[i] - values[i - 1]);
    if (d >= step) levelChanges += 1;
    if (d >= 2 * step) bigJumps += 1;
  }
  // 相邻柱高频繁跳档 + 存在多档大跳，说明每根柱子独立随机而非平滑连续。
  assert.ok(
    levelChanges >= values.length * 0.4,
    `expected frequent height changes, got ${levelChanges}`
  );
  assert.ok(bigJumps >= 2, `expected multi-level jumps, got ${bigJumps}`);
});
