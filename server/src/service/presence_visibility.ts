import type { PrivacyRule } from "@mushroom/shared";
import { bucketizeLastActiveAt } from "@mushroom/shared";
import ContactRepository from "../repository/contact_repository";
import PrivacyRepository from "../repository/privacy_repository";

/**
 * P3 presence 可见性 + 模糊化的纯计算工具集合。
 *
 * 出口位置（broadcast / snapshot / HTTP）统一调用以下加载器后再 evaluate，
 * 来确保策略一致：
 *  - presence_visibility = 0 (anyone)        正常返回 + last_active_at 模糊化
 *  - presence_visibility = 1 (contacts_only) 仅当 viewer 把 target 加为联系人时返回真实数据，否则隐藏
 *  - presence_visibility = 2 (nobody)        始终隐藏
 *  - viewer === target                       自查不过滤、不模糊化
 *
 * "隐藏"= is_online=false, last_active_at=undefined, active_device_count=0
 *
 * 联系人语义：mushroom-app 是单向通讯录模型（A 把 B 加为联系人不会自动反向写入）。
 * 与 Telegram / WhatsApp 单向通讯录对齐，contacts_only 的判定按
 * "viewer→target 单向"执行——即"我把你加进了通讯录，我就能看到你的在线状态"。
 * 这避免了在仅单向加好友（这是常见状态）时整个 presence 顶部状态文案
 * 直接消失的体验问题。
 *
 * 两种 context 加载入口：
 *  - `loadPresenceVisibilityContext(viewerId, targets[])`  viewer 视角批量查询
 *    多个 target；用于 HTTP `/presence` 与客户端 `presence.snapshot`。
 *  - `loadPresenceVisibilityForBroadcast(targetId, viewers[])` target 视角
 *    批量计算多个 viewer；用于 broadcast 时按 viewer 过滤。两者形状对称，
 *    各自只跑常数次 SQL，避免对方场景下的 N+1。
 */

export interface PresenceSummaryForFilter {
  is_online: boolean;
  active_device_count: number;
  last_active_at?: string;
}

/**
 * evaluate 选项。
 * `skipBucketize=true` 用于 presence transition 广播：
 *   下线那一瞬间的 last_active_at = "viewer 刚刚才看到 target 在线的时刻"，
 *   把它桶化到 5min 边界既无隐私收益、又会破坏"刚刚活跃"等近端文案。
 *   仅 transition 广播路径使用；snapshot / HTTP 等"回看历史"场景仍然桶化。
 */
export interface PresenceEvaluateOptions {
  skipBucketize?: boolean;
}

const HIDDEN_PRESENCE: PresenceSummaryForFilter = Object.freeze({
  is_online: false,
  active_device_count: 0,
  last_active_at: undefined
});

/**
 * 加载 viewer 视角下批量 targets 的可见性 + 联系人信息。
 * 返回一个 evaluate 函数，供调用方对每个 target 做应用决策。
 *
 * 单向联系人语义下需要 2 条 SQL：
 *  1. targets 的 privacy 设置（批量）
 *  2. viewer→target 方向：viewer 已加为联系人的 target 子集
 */
export async function loadPresenceVisibilityContext(
  viewerUserId: number,
  targetUserIds: number[]
) {
  const uniqueTargets = Array.from(
    new Set(
      targetUserIds
        .map(id => Number(id))
        .filter(id => Number.isFinite(id) && id > 0)
    )
  );

  if (uniqueTargets.length === 0) {
    return {
      evaluate: (
        _targetId: number,
        summary: PresenceSummaryForFilter,
        options?: PresenceEvaluateOptions
      ) => applyMaskAndBucketize(summary, true, options)
    };
  }

  // 自查不需要走联系人 / 隐私查询
  const targetsExcludingSelf = uniqueTargets.filter(id => id !== viewerUserId);

  const [privacyRows, viewerSavedTargets] = await Promise.all([
    PrivacyRepository.findManyByUserIds(targetsExcludingSelf),
    ContactRepository.listSavedContactIds(viewerUserId, targetsExcludingSelf)
  ]);

  const visibilityMap = new Map<number, PrivacyRule>();
  for (const row of privacyRows) {
    visibilityMap.set(Number(row.user_id), row.presence_visibility);
  }

  const viewerSavedSet = new Set(viewerSavedTargets.map(id => Number(id)));

  return {
    evaluate(
      targetId: number,
      summary: PresenceSummaryForFilter,
      options?: PresenceEvaluateOptions
    ): PresenceSummaryForFilter {
      // 自查直通
      if (targetId === viewerUserId) {
        return applyMaskAndBucketize(summary, true, options);
      }
      // 默认 contacts_only(1)，与表默认值一致
      const visibility = visibilityMap.get(targetId) ?? 1;
      if (visibility === 2) {
        return HIDDEN_PRESENCE;
      }
      if (visibility === 0) {
        return applyMaskAndBucketize(summary, false, options);
      }
      // visibility === 1 contacts_only：单向判定，viewer 把 target 加为联系人即可见
      if (!viewerSavedSet.has(targetId)) {
        return HIDDEN_PRESENCE;
      }
      return applyMaskAndBucketize(summary, false, options);
    }
  };
}

/**
 * 对单个 viewer→target 的 presence summary 应用可见性 + 模糊化。
 * 主要用于 broadcastPresenceTransition（已知 target=被广播者，viewer=每个订阅者）。
 */
export async function evaluatePresenceVisibility(
  viewerUserId: number,
  targetUserId: number,
  summary: PresenceSummaryForFilter
): Promise<PresenceSummaryForFilter> {
  const ctx = await loadPresenceVisibilityContext(viewerUserId, [targetUserId]);
  return ctx.evaluate(targetUserId, summary);
}

/**
 * Broadcast 专用：target 视角批量加载若干 viewer 的可见性上下文。
 *
 * 与 `loadPresenceVisibilityContext`（viewer 视角批量 targets）对称，
 * 用于一次 presence transition flush：target 固定、viewer 多个。
 * 之前 broadcast 对每个 viewer 调一次 `evaluatePresenceVisibility`，N+1。
 * 本函数在一次 flush 内只跑常数次 SQL：
 *  1. target 的隐私设置（1 行）
 *  2. viewer→target 方向："把 target 加为联系人"的 owner 列表，内存与 viewers 求交
 */
export async function loadPresenceVisibilityForBroadcast(
  targetUserId: number,
  viewerUserIds: number[]
) {
  const uniqueViewers = Array.from(
    new Set(
      viewerUserIds
        .map(id => Number(id))
        .filter(id => Number.isFinite(id) && id > 0 && id !== targetUserId)
    )
  );

  if (uniqueViewers.length === 0) {
    return {
      evaluate: (
        viewerId: number,
        summary: PresenceSummaryForFilter,
        options?: PresenceEvaluateOptions
      ) =>
        viewerId === targetUserId
          ? applyMaskAndBucketize(summary, true, options)
          : HIDDEN_PRESENCE
    };
  }

  const [privacyRow, ownersOfTarget] = await Promise.all([
    PrivacyRepository.findByUserId(targetUserId),
    // viewer→target：列出"把 target 加为联系人"的所有 owner，内存与 uniqueViewers 求交
    ContactRepository.listReverseContactOwners(targetUserId)
  ]);

  const visibility: PrivacyRule = privacyRow?.presence_visibility ?? 1;
  const ownerSet = new Set(ownersOfTarget.map(id => Number(id)));
  // viewer→target 方向，仅保留 uniqueViewers 中存在的，避免无关 owner 进入内存
  const viewerSavedTargetSet = new Set(
    uniqueViewers.filter(id => ownerSet.has(id))
  );

  return {
    evaluate(
      viewerId: number,
      summary: PresenceSummaryForFilter,
      options?: PresenceEvaluateOptions
    ): PresenceSummaryForFilter {
      // 自查直通（broadcast 通常不会把消息派给 target 自己，这里保留以防误用）
      if (viewerId === targetUserId) {
        return applyMaskAndBucketize(summary, true, options);
      }
      if (visibility === 2) {
        return HIDDEN_PRESENCE;
      }
      if (visibility === 0) {
        return applyMaskAndBucketize(summary, false, options);
      }
      // visibility === 1 contacts_only：单向，viewer 把 target 加为联系人即可见
      if (!viewerSavedTargetSet.has(viewerId)) {
        return HIDDEN_PRESENCE;
      }
      return applyMaskAndBucketize(summary, false, options);
    }
  };
}

/**
 * evaluate 选项。
/**
 * 应用 last_active_at 模糊化（5 分钟桶）。`isSelf` 时不做模糊化。
 * `options.skipBucketize` 透传给"刚下线"等实时场景，避免与"在线"瞬间脱节。
 */
function applyMaskAndBucketize(
  summary: PresenceSummaryForFilter,
  isSelf: boolean,
  options?: PresenceEvaluateOptions
): PresenceSummaryForFilter {
  if (isSelf) {
    return summary;
  }
  return {
    is_online: summary.is_online,
    active_device_count: summary.active_device_count,
    last_active_at: options?.skipBucketize
      ? summary.last_active_at
      : bucketizeLastActiveAt(summary.last_active_at)
  };
}
