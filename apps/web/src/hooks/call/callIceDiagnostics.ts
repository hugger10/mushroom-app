import log from "@/utils/log";

// 通话级别的 ICE 候选聚合器：成功路径完全静默，只在终态时输出一行
// summary；失败路径每个 call_id 最多采样 N 条错误明细，避免一条线路
// 抖动时刷屏。与移动端的纯计数实现相比保留了"首因诊断"能力，便于排查
// 单向音 / 无法穿透等问题。
const callLog = log.scope("call");

type IceCounter = {
  added: number;
  rejected: number;
  warnedRejected: number;
};

const iceCounters = new Map<string, IceCounter>();
const ICE_REJECT_WARN_LIMIT = import.meta.env.DEV ? 10 : 3;

function ensureIceCounter(callId: string): IceCounter {
  let entry = iceCounters.get(callId);
  if (!entry) {
    entry = { added: 0, rejected: 0, warnedRejected: 0 };
    iceCounters.set(callId, entry);
  }
  return entry;
}

export function bumpIceCounter(callId: string, ok: boolean, err?: unknown) {
  if (!callId) return;
  const entry = ensureIceCounter(callId);
  if (ok) {
    entry.added += 1;
    return;
  }
  entry.rejected += 1;
  if (entry.warnedRejected < ICE_REJECT_WARN_LIMIT) {
    entry.warnedRejected += 1;
    callLog.warn("ice candidate rejected", {
      callId,
      err: err instanceof Error ? err.message : String(err)
    });
  }
}

export function drainIceCounter(callId: string) {
  if (!callId) return;
  const entry = iceCounters.get(callId);
  if (!entry) return;
  iceCounters.delete(callId);
  if (entry.added === 0 && entry.rejected === 0) return;
  callLog.info("ice summary", {
    callId,
    added: entry.added,
    rejected: entry.rejected
  });
}
