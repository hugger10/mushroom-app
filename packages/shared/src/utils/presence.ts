import type { UserPresenceSummary } from "../types/api";

/**
 * Presence 相关工具集合。
 *
 * 设计说明（重要 — 修改前请阅读）：
 *  - 顶部精确文案副标题（"刚刚活跃 / X 分钟前活跃 / 昨天 HH:MM 活跃 …"）
 *    使用 `formatLastActiveTime`（位于 `./date.ts`），输入为服务端推送的
 *    `last_active_at`，与 5 分钟桶化的隐私策略协同工作。
 *  - 头像装饰圈 / 角标使用 `resolvePresenceLevel`（本文件），按 5min / 1h
 *    双桶生成 `online | recent | offline` 三态视觉。
 *  - **两套逻辑故意分离**：副标题给精确文案、装饰圈给粗状态视觉。
 *    例如可能出现"3 分钟前活跃 + 绿圈"或"7 分钟前活跃 + 黄圈"，
 *    这是设计预期，不是 bug。修改前请评估两者的语义是否仍合理。
 *
 * 隐私模糊化：
 *  - 服务端在 broadcast snapshot / HTTP 出口对 `last_active_at` 按
 *    `PRESENCE_LAST_SEEN_BUCKET_MS`（5min）floor 桶化，避免泄漏精确活跃时间。
 *  - presence transition（实时 online↔offline 变化）广播路径**不桶化**，
 *    保留真实下线时刻以支持"刚刚活跃"等近端文案。详见
 *    `server/src/service/presence_visibility.ts` 的 `PresenceEvaluateOptions`。
 */

// 直接聊天会话中 peer presence 的 HTTP 兜底刷新阈值。
// P2 引入按需订阅 + 服务端按 viewer 推送后，HTTP 轮询仅作为
// WS 失联 / 推送丢失 / 后台恢复时的兜底，无需高频；
// 拉长到 5 分钟（接近 device presence TTL），显著降低无意义请求量。
export const PRESENCE_DIRECT_CHAT_STALE_MS = 5 * 60 * 1000;

export const PRESENCE_RECENT_ONLINE_WINDOW_MS = 5 * 60 * 1000;
export const PRESENCE_RECENT_ACTIVE_WINDOW_MS = 60 * 60 * 1000;

/**
 * P3：Last seen 模糊化阈值（5 分钟桶大小）。
 * 服务端在 broadcast snapshot / HTTP 出口将 last_active_at 按 5 分钟 floor，
 * 避免暴露精确活跃时间。transition 广播路径豁免桶化（实时事件）。
 */
export const PRESENCE_LAST_SEEN_BUCKET_MS = 5 * 60 * 1000;

/**
 * 服务端使用：将 last_active_at 按 5 分钟桶 floor。
 * 入参可以是 Date / ISO string / undefined。返回 ISO string 或 undefined。
 */
export function bucketizeLastActiveAt(
  value: string | Date | null | undefined,
  bucketMs: number = PRESENCE_LAST_SEEN_BUCKET_MS
): string | undefined {
  if (!value) return undefined;
  const ts = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(ts)) return undefined;
  const bucketed = Math.floor(ts / bucketMs) * bucketMs;
  return new Date(bucketed).toISOString();
}

export type PresenceLevel = "online" | "recent" | "offline";

/**
 * Resolve a coarse presence level from raw presence info, used to drive UI
 * indicators (e.g. avatar online dot) consistently across the app.
 *
 * Buckets:
 *  - online : user is actively online, or last activity within 5 minutes.
 *  - recent : last activity within the past hour.
 *  - offline: no recent activity / unknown.
 */
export function resolvePresenceLevel(
  isOnline: boolean | null | undefined,
  lastActiveAt: string | null | undefined,
  now: number = Date.now()
): PresenceLevel {
  if (isOnline) {
    return "online";
  }
  if (!lastActiveAt) {
    return "offline";
  }
  const timestamp = Date.parse(lastActiveAt);
  if (!Number.isFinite(timestamp)) {
    return "offline";
  }
  const diffMs = now - timestamp;
  if (diffMs < 0) {
    return "online";
  }
  if (diffMs <= PRESENCE_RECENT_ONLINE_WINDOW_MS) {
    return "online";
  }
  if (diffMs <= PRESENCE_RECENT_ACTIVE_WINDOW_MS) {
    return "recent";
  }
  return "offline";
}

export interface PresenceSummaryEntry extends UserPresenceSummary {
  user_id: number;
}

export function shouldRefreshPresence(
  lastFetchedAt: number,
  now: number,
  staleMs: number
) {
  if (!lastFetchedAt) {
    return true;
  }

  return now - lastFetchedAt >= staleMs;
}

function toPresenceTimestamp(value?: string | null) {
  if (!value) {
    return null;
  }

  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

export function mergePresenceSummary(
  current: UserPresenceSummary | null | undefined,
  incoming: UserPresenceSummary,
  latestKnownLastActiveAt?: string | null
): UserPresenceSummary {
  const currentTimestamp = toPresenceTimestamp(current?.last_active_at);
  const incomingTimestamp = toPresenceTimestamp(incoming.last_active_at);
  const latestKnownTimestamp = toPresenceTimestamp(latestKnownLastActiveAt);

  // observed_at 单调性保护：
  // HTTP presence-batch 与 WS presence/presence.snapshot 可能并发到达，
  // 仅靠"最后到达"覆盖会导致 is_online 在两次响应间来回跳变（典型表现：
  // "3 小时前活跃" 闪烁切换到 "在线" 再切回）。
  // 当 incoming 的 observed_at 比 current 更早时，认为它是过期数据，
  // 仅允许更新 last_active_at（取较新者），不覆盖 is_online / active_device_count。
  // 老服务端不返回 observed_at 时退化为旧行为（incoming 优先），保持向后兼容。
  const currentObservedAt = toPresenceTimestamp(current?.observed_at);
  const incomingObservedAt = toPresenceTimestamp(incoming.observed_at);
  const incomingIsStale =
    currentObservedAt != null &&
    incomingObservedAt != null &&
    incomingObservedAt < currentObservedAt;

  let last_active_at = incoming.last_active_at;
  if (
    currentTimestamp != null &&
    (incomingTimestamp == null || currentTimestamp > incomingTimestamp)
  ) {
    last_active_at = current?.last_active_at;
  }

  const mergedTimestamp = toPresenceTimestamp(last_active_at);
  if (
    latestKnownTimestamp != null &&
    (mergedTimestamp == null || latestKnownTimestamp > mergedTimestamp)
  ) {
    last_active_at = latestKnownLastActiveAt ?? undefined;
  }

  if (incomingIsStale) {
    return {
      is_online: current?.is_online ?? false,
      active_device_count: current?.active_device_count ?? 0,
      last_active_at,
      observed_at: current?.observed_at
    };
  }

  return {
    is_online: incoming.is_online,
    active_device_count: incoming.active_device_count,
    last_active_at,
    observed_at: incoming.observed_at ?? current?.observed_at
  };
}

export function mergePresenceEntriesByUserId(
  currentPresenceByUserId: Record<number, UserPresenceSummary>,
  entries: PresenceSummaryEntry[],
  latestKnownLastActiveAtByUserId: Record<number, string> = {}
) {
  const nextPresenceByUserId = { ...currentPresenceByUserId };
  const nextLastActiveAtByUserId = { ...latestKnownLastActiveAtByUserId };

  for (const entry of entries) {
    const userId = Number(entry.user_id);
    if (!Number.isFinite(userId) || userId <= 0) {
      continue;
    }

    const merged = mergePresenceSummary(
      nextPresenceByUserId[userId],
      {
        is_online: entry.is_online,
        active_device_count: entry.active_device_count,
        last_active_at: entry.last_active_at,
        // 透传服务端观测时刻，参与 mergePresenceSummary 的单调性判定。
        observed_at: entry.observed_at
      },
      nextLastActiveAtByUserId[userId]
    );
    nextPresenceByUserId[userId] = merged;
    if (merged.last_active_at) {
      nextLastActiveAtByUserId[userId] = merged.last_active_at;
    }
  }

  return {
    nextPresenceByUserId,
    nextLastActiveAtByUserId
  };
}
