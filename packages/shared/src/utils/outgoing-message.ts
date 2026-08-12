export type OutgoingRetryCandidate = {
  status?: number | null;
  retry_count?: number | null;
  next_retry_at?: string | null;
  updated_at?: string | null;
  last_error?: string | null;
};

export const DEFAULT_OUTGOING_IN_FLIGHT_GRACE_MS = 10_000;

export type OutgoingFailureTranslate = (
  key: string,
  options?: { defaultValue?: string } & Record<string, unknown>
) => string;

function tr(
  translate: OutgoingFailureTranslate | undefined,
  key: string,
  fallback: string
): string {
  if (!translate) return fallback;
  return translate(key, { defaultValue: fallback });
}

function getOutgoingPermanentFailureDisplayText(
  lastError?: string | null,
  translate?: OutgoingFailureTranslate
) {
  const normalized = String(lastError || "")
    .trim()
    .toLowerCase();

  if (
    normalized.includes("你已拉黑对方，无法发送消息") ||
    normalized.includes("你已屏蔽对方，无法发送消息")
  ) {
    return tr(
      translate,
      "outgoingMessage.blockedByYou",
      "你已经将对方屏蔽，消息未发送"
    );
  }

  if (
    normalized.includes("对方已经将你拉黑，无法发送消息") ||
    normalized.includes("对方已经将你屏蔽，无法发送消息")
  ) {
    return tr(
      translate,
      "outgoingMessage.blockedByPeer",
      "对方已经将你屏蔽，消息未发送"
    );
  }

  if (normalized.includes("group is muted for regular members")) {
    return tr(
      translate,
      "outgoingMessage.groupMutedAll",
      "群主已开启全员禁言，消息未发送"
    );
  }

  if (normalized.includes("currently muted in this group")) {
    return tr(translate, "outgoingMessage.selfMuted", "你已被禁言，消息未发送");
  }

  return null;
}

export function isRetryableOutgoingError(lastError?: string | null) {
  if (!String(lastError || "").trim()) {
    return true;
  }

  return getOutgoingPermanentFailureDisplayText(lastError) === null;
}

export function getOutgoingFailureDisplayText(
  lastError?: string | null,
  translate?: OutgoingFailureTranslate
) {
  const blockFailureText = getOutgoingPermanentFailureDisplayText(
    lastError,
    translate
  );
  if (blockFailureText) {
    return blockFailureText;
  }

  return String(lastError || "").trim();
}

export function shouldRetryOutgoingMessage(
  item: OutgoingRetryCandidate,
  nowMs = Date.now(),
  options?: {
    autoRetryLimit?: number;
    inFlightGraceMs?: number;
  }
) {
  const autoRetryLimit = options?.autoRetryLimit ?? 3;
  const inFlightGraceMs =
    options?.inFlightGraceMs ?? DEFAULT_OUTGOING_IN_FLIGHT_GRACE_MS;

  if (item.status === 0) {
    return false;
  }

  if (!isRetryableOutgoingError(item.last_error)) {
    return false;
  }

  if (item.next_retry_at) {
    const retryAtMs = new Date(item.next_retry_at).getTime();
    if (Number.isFinite(retryAtMs) && retryAtMs > nowMs) {
      return false;
    }
  }

  if (item.status === -1 && Number(item.retry_count ?? 0) >= autoRetryLimit) {
    return false;
  }

  if (item.status === 1) {
    const updatedAtMs = item.updated_at
      ? new Date(item.updated_at).getTime()
      : Number.NaN;
    if (Number.isFinite(updatedAtMs) && nowMs - updatedAtMs < inFlightGraceMs) {
      return false;
    }
  }

  return true;
}

/**
 * 网络层连接态。各平台 WS / Realtime 客户端均对外暴露该集合：
 * - `connected`     : WS 已就绪，可以收发消息。
 * - `connecting`    : 首次握手。
 * - `reconnecting`  : 网络抖动后正在重连。
 * - `offline`       : 无网络或重连耗尽。
 */
export type ClientConnectionState =
  | "connected"
  | "connecting"
  | "reconnecting"
  | "offline";

/**
 * 判定一条"失败 / 发送中"的本地消息当前应展示为"等待网络…"还是"发送失败"。
 *
 * 行为对齐主流 IM：
 * - 在线 + 失败  → "发送失败"（明确错误，鼓励用户处理）
 * - 离线 + 失败  → "等待网络…"（柔和提示，自动重试中）
 * - 永久失败（拉黑/禁言等）→ 不属于"等待网络"，调用方自行判断。
 *
 * 仅做语义判定，不返回具体文案；具体文案由 UI 决定（i18n 友好）。
 */
export function isMessageAwaitingNetwork(
  connectionState: ClientConnectionState | null | undefined,
  status: number | null | undefined,
  lastError?: string | null
): boolean {
  if (status !== -1 && status !== 1) return false;
  if (!isRetryableOutgoingError(lastError)) return false;
  return connectionState !== "connected";
}
