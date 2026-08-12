import type { PrivacyRule, UserPrivacySettings } from "../types/models";

/**
 * 本端是否应该渲染他人的已读回执（蓝双勾 / 群已读勾）。
 *
 * 与服务端一致的双向失效策略：当本端 `read_receipts_visibility === 2`（关闭）
 * 时，UI 层不渲染任何对端已读信号，作为客户端兜底防御层。
 *
 * - 缺失 settings / 缺失字段 → 视为开启（默认值 0）
 * - `2` → 关闭，返回 false
 * - 其他值（0 / 1）→ 开启
 */
export function canRenderPeerReadReceipts(
  settings?: { read_receipts_visibility?: PrivacyRule } | null
): boolean {
  if (!settings) return true;
  return settings.read_receipts_visibility !== 2;
}

/**
 * 等价于 canRenderPeerReadReceipts，但接受完整 `UserPrivacySettings`。
 * 单独导出语义化函数名，避免调用点写 `!== 2` 魔法值。
 */
export function isReadReceiptsEnabled(
  settings?: UserPrivacySettings | null
): boolean {
  return canRenderPeerReadReceipts(settings);
}
