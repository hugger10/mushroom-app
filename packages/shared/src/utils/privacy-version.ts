import type { UserPrivacySettingsEnvelope } from "../types/models";

/**
 * 隐私设置幂等合并：仅在 incoming.version > current.version 时覆盖。
 *
 * 解决多端 / WS 与 HTTP 通道乱序问题：例如手机端先改了隐私（version=3），
 * WS 已推送给桌面端，但桌面端此时主动 fetch 拉到旧值（version=2），
 * 应丢弃旧值而非覆盖。
 *
 * @returns 合并后的 envelope。当 incoming 应被接受时返回 incoming，
 *          否则返回 current（引用相等表示无变化）。
 */
export function applyPrivacyVersion(
  current: UserPrivacySettingsEnvelope | null,
  incoming: UserPrivacySettingsEnvelope
): UserPrivacySettingsEnvelope {
  if (!current) return incoming;
  if (incoming.version > current.version) return incoming;
  return current;
}

/**
 * 仅判断 incoming 是否应被接受（不实际合并）。
 */
export function shouldAcceptPrivacyUpdate(
  current: UserPrivacySettingsEnvelope | null,
  incoming: UserPrivacySettingsEnvelope
): boolean {
  if (!current) return true;
  return incoming.version > current.version;
}
