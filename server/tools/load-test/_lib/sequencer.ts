/**
 * 发言顺序与时间戳生成器：
 *   - 马尔可夫链：当前发送者下一次仍是自己的概率 0.55，否则等概率切换到其他成员
 *   - 5% 概率触发"快速连发"：固定该发送者再连发 2~3 条
 *   - 时间戳：从 startMs 推进到 endMs，单步均值 = (end-start)/count，叠加 ±60% jitter
 */

export interface PlanItem {
  senderId: number;
  /** Unix 毫秒 */
  ts: number;
}

export function buildSendingPlan(params: {
  memberIds: number[];
  count: number;
  startMs: number;
  endMs?: number;
}): PlanItem[] {
  const { memberIds, count } = params;
  if (memberIds.length < 2) {
    throw new Error("buildSendingPlan: memberIds.length 必须 >= 2");
  }
  const startMs = params.startMs;
  const endMs = params.endMs ?? Date.now();
  const span = Math.max(1, endMs - startMs);
  const stepBase = span / count;

  const plan: PlanItem[] = [];
  let currentIdx = Math.floor(Math.random() * memberIds.length);
  let burstRemaining = 0;
  let cursor = startMs;

  for (let i = 0; i < count; i += 1) {
    if (burstRemaining > 0) {
      // 保持当前发送者
      burstRemaining -= 1;
    } else {
      const stay = Math.random() < 0.55;
      if (!stay) {
        let nextIdx = currentIdx;
        // 等概率切换到非自己的另一个成员
        while (nextIdx === currentIdx) {
          nextIdx = Math.floor(Math.random() * memberIds.length);
        }
        currentIdx = nextIdx;
      }
      // 5% 触发连发 2~3 条
      if (Math.random() < 0.05) {
        burstRemaining = 1 + Math.floor(Math.random() * 2);
      }
    }

    // 时间推进：基础步长 ±60% jitter；连发期间步长压缩到 0.1~0.3 倍
    const isBurst =
      burstRemaining > 0 ||
      (i > 0 &&
        plan[i - 1] &&
        plan[i - 1].senderId === memberIds[currentIdx] &&
        Math.random() < 0.4);
    const jitter = 0.4 + Math.random() * 1.2;
    const step = isBurst
      ? Math.max(50, stepBase * (0.1 + Math.random() * 0.2))
      : Math.max(50, stepBase * jitter);
    cursor = Math.min(endMs, cursor + step);
    plan.push({ senderId: memberIds[currentIdx], ts: Math.floor(cursor) });
  }

  // 保证严格单调递增（防止极端 jitter 出现持平）
  for (let i = 1; i < plan.length; i += 1) {
    if (plan[i].ts <= plan[i - 1].ts) {
      plan[i].ts = plan[i - 1].ts + 1;
    }
  }
  return plan;
}
