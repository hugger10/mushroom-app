/**
 * 假波形（视觉欺骗）生成工具。
 *
 * 用于在没有真实音频采样数据时，根据稳定 seed 生成确定性的、看起来像语音
 * 的波形柱高数组。同一 seed 多次调用结果完全相同，从而保证同一条语音消息
 * 在任何客户端、任何渲染时刻都呈现一致的形状。
 */

/**
 * 将任意字符串映射为 32-bit 无符号整数。基于 cyrb53 的简化变体，纯函数，
 * 跨 JS 引擎结果一致。
 */
export function hashSeed(seed: string): number {
  let h1 = 0xdeadbeef ^ 0;
  let h2 = 0x41c6ce57 ^ 0;
  for (let i = 0; i < seed.length; i += 1) {
    const ch = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 ^ h2) >>> 0;
}

/**
 * Mulberry32 PRNG。给定 32-bit 整数种子，返回稳定的伪随机序列函数。
 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface GenerateFakeWaveformOptions {
  seed: string;
  barCount: number;
  durationSeconds?: number;
  /** 输出值下限，默认 0.18 */
  minValue?: number;
  /** 输出值上限，默认 1 */
  maxValue?: number;
  /** 高度量化档位数，默认 8；>1 时把柱高吸附到离散档位（等化器感） */
  quantizeLevels?: number;
}

/**
 * 生成一段长度为 barCount、确定性、看起来像语音的波形数组。
 *
 * 算法：
 * 1. 用 hashSeed + mulberry32 得到稳定的 PRNG。
 * 2. 对每根柱子生成独立的全幅噪声 (0~1)。
 * 3. 叠加 2~3 个正弦波包络（频率与 durationSeconds 反相关，相位由 seed 派生），
 *    仅提供"响/轻"整体段落，避免过份规整。
 * 4. 轻量邻居平滑去除过尖刺。
 * 5. 归一化到 [minValue, maxValue]。
 * 6. 量化到 quantizeLevels 个离散档位，呈现参差的"等化器"观感。
 */
export function generateFakeWaveform(
  options: GenerateFakeWaveformOptions
): number[] {
  const {
    seed,
    barCount,
    durationSeconds,
    minValue = 0.18,
    maxValue = 1,
    quantizeLevels = 8
  } = options;

  if (barCount <= 0) {
    return [];
  }

  const safeSeed = typeof seed === "string" && seed.length > 0 ? seed : "_";
  const hashed = hashSeed(safeSeed);
  const prng = mulberry32(hashed);

  // 用 seed 派生三个独立相位 / 振幅，使每条消息形状不同。
  const phase1 = prng() * Math.PI * 2;
  const phase2 = prng() * Math.PI * 2;
  const phase3 = prng() * Math.PI * 2;
  const amp1 = 0.55 + prng() * 0.25; // 主能量包络
  const amp2 = 0.25 + prng() * 0.2; // 次级包络
  const amp3 = 0.1 + prng() * 0.15; // 高频细节

  // 时长影响包络频率：短消息高频（峰更密集），长消息低频（起伏更慢）。
  const duration = Math.max(
    0.5,
    Math.min(60, Number(durationSeconds) > 0 ? Number(durationSeconds) : 4)
  );
  const baseCycles = 2 + 7 / duration; // 1s≈9, 4s≈3.75, 10s≈2.7, 30s≈2.23
  const cycles2 = baseCycles * (1.7 + prng() * 0.6);
  const cycles3 = baseCycles * (4 + prng() * 1.5);

  const raw: number[] = new Array(barCount);
  for (let i = 0; i < barCount; i += 1) {
    const t = barCount === 1 ? 0 : i / (barCount - 1); // 0..1
    const envelope =
      amp1 * Math.sin(t * Math.PI * 2 * baseCycles + phase1) +
      amp2 * Math.sin(t * Math.PI * 2 * cycles2 + phase2) +
      amp3 * Math.sin(t * Math.PI * 2 * cycles3 + phase3);
    // 端点弱化，避免开头/结尾突然顶满，更像真实语音的渐入渐出。
    const edgeFade = Math.sin(t * Math.PI); // 0..1..0
    // 每根柱子独立的全幅噪声：让相邻柱高差异拉大，呈现散乱的语音峰谷。
    const noise = prng();
    // 噪声高度主导（0.7），包络仅提供微弱"响/轻"整体段落（0.3）。
    const mixed = ((envelope + 1) / 2) * (0.3 + edgeFade * 0.2) + noise * 0.7;
    raw[i] = mixed;
  }

  // 邻居平滑（极轻）：v[i] = 0.9*v[i] + 0.05*v[i-1] + 0.05*v[i+1]
  const smoothed: number[] = new Array(barCount);
  for (let i = 0; i < barCount; i += 1) {
    const prev = raw[i - 1] ?? raw[i];
    const next = raw[i + 1] ?? raw[i];
    smoothed[i] = raw[i] * 0.9 + prev * 0.05 + next * 0.05;
  }

  // 归一化到 [minValue, maxValue]
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < barCount; i += 1) {
    if (smoothed[i] < min) min = smoothed[i];
    if (smoothed[i] > max) max = smoothed[i];
  }
  const span = max - min;
  const targetSpan = Math.max(0, maxValue - minValue);
  const result: number[] = new Array(barCount);
  if (span <= 1e-6 || targetSpan <= 1e-6) {
    const fallback = (minValue + maxValue) / 2;
    for (let i = 0; i < barCount; i += 1) {
      result[i] = fallback;
    }
    return result;
  }
  for (let i = 0; i < barCount; i += 1) {
    const normalized = (smoothed[i] - min) / span; // 0..1
    // 量化到离散档位，配合散乱分布呈现"等化器"观感。
    const steps = quantizeLevels - 1;
    const quantized =
      steps > 0 ? Math.round(normalized * steps) / steps : normalized;
    result[i] = minValue + quantized * targetSpan;
  }
  return result;
}
