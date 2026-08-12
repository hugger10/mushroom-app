import baseLogger from "./logger";
import { getRequestLogger } from "./log_context";

/**
 * Payload 采样日志：在出现"打不出 bug，怀疑是消息内容/外部 envelope 有问题"
 * 的情况下，运维可以临时打开开关把命中 scope 的负载快照写入 trace 日志。
 *
 * 设计目标：
 *   - **默认完全零开销**：开关关闭时函数立即 return，不构造对象、不序列化。
 *   - **永远不打明文**：调用前做 key 级 redact，并按字节数截断，避免一次
 *     trace 日志把磁盘/采集端打爆。
 *   - **级别明确**：固定走 pino `trace`，即便误把 LOG_LEVEL 提到 debug 也
 *     不会自动放出 payload；必须显式 `LOG_LEVEL=trace` 才会落盘/打印。
 *
 * 环境变量：
 *   LOG_PAYLOAD_ENABLED       总开关，默认 false。
 *   LOG_PAYLOAD_SCOPES        以英文逗号分隔的 scope 白名单，留空表示放行全部。
 *   LOG_PAYLOAD_MAX_BYTES     单条 payload 最大字节数，超出截断（默认 2048）。
 *   LOG_PAYLOAD_SAMPLE_RATE   0~1 之间采样率，默认 1（命中即输出）。
 *   LOG_PAYLOAD_USER_ALLOWLIST 仅采样指定 userId（逗号分隔），留空不限制。
 *   LOG_PAYLOAD_REDACT_KEYS   命中 key 整体替换为 "***"。
 */

const DEFAULT_REDACT_KEYS = [
  "password",
  "token",
  "access_token",
  "refresh_token",
  "phone",
  "email",
  "authorization"
];

function readBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === "true") return true;
  if (raw === "false") return false;
  return fallback;
}

function readNum(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const v = Number(raw);
  return Number.isFinite(v) ? v : fallback;
}

function readList(name: string): string[] {
  const raw = process.env[name]?.trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);
}

interface PayloadLoggerConfig {
  enabled: boolean;
  scopes: Set<string>;
  maxBytes: number;
  sampleRate: number;
  userAllowlist: Set<number>;
  redactKeys: Set<string>;
}

function loadConfig(): PayloadLoggerConfig {
  return {
    enabled: readBool("LOG_PAYLOAD_ENABLED", false),
    scopes: new Set(readList("LOG_PAYLOAD_SCOPES")),
    maxBytes: readNum("LOG_PAYLOAD_MAX_BYTES", 2048),
    sampleRate: Math.max(0, Math.min(1, readNum("LOG_PAYLOAD_SAMPLE_RATE", 1))),
    userAllowlist: new Set(
      readList("LOG_PAYLOAD_USER_ALLOWLIST")
        .map(v => Number(v))
        .filter(v => Number.isFinite(v))
    ),
    redactKeys: new Set(
      (readList("LOG_PAYLOAD_REDACT_KEYS").length > 0
        ? readList("LOG_PAYLOAD_REDACT_KEYS")
        : DEFAULT_REDACT_KEYS
      ).map(k => k.toLowerCase())
    )
  };
}

let cachedConfig: PayloadLoggerConfig | null = null;

function getConfig(): PayloadLoggerConfig {
  if (!cachedConfig) {
    cachedConfig = loadConfig();
  }
  return cachedConfig;
}

/**
 * 仅供测试使用：强制重新读取环境变量。生产代码不应调用。
 */
export function __reloadPayloadLoggerConfigForTest(): void {
  cachedConfig = null;
}

/**
 * 递归脱敏：命中 redact key 的整个 value 替换为 "***"；其他保留原值。
 */
function redact(value: unknown, redactKeys: Set<string>): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map(item => redact(item, redactKeys));
  }
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (redactKeys.has(k.toLowerCase())) {
      result[k] = "***";
    } else {
      result[k] = redact(v, redactKeys);
    }
  }
  return result;
}

export interface PayloadLogContext {
  /** scope 标签，例 "ws.chat.in" / "outbox.deliver" / "push.envelope"。 */
  scope: string;
  userId?: number | null;
  conversationId?: string | null;
  messageId?: string | null;
  classify?: string | null;
  outboxId?: string | number | null;
}

/**
 * 主入口：在关键 payload 落点调用。默认禁用时调用成本 ≈ 一次对象属性读取。
 */
export function logPayload(ctx: PayloadLogContext, payload: unknown): void {
  const cfg = getConfig();
  if (!cfg.enabled) return;
  if (cfg.scopes.size > 0 && !cfg.scopes.has(ctx.scope)) return;
  if (
    cfg.userAllowlist.size > 0 &&
    (ctx.userId == null || !cfg.userAllowlist.has(Number(ctx.userId)))
  ) {
    return;
  }
  if (cfg.sampleRate < 1 && Math.random() >= cfg.sampleRate) return;

  let serialized: string;
  try {
    const redacted = redact(payload, cfg.redactKeys);
    serialized =
      typeof redacted === "string" ? redacted : JSON.stringify(redacted);
  } catch (err) {
    baseLogger.warn(
      { err, scope: ctx.scope },
      "Payload logger serialize failed"
    );
    return;
  }

  let truncated = false;
  if (serialized.length > cfg.maxBytes) {
    serialized = serialized.slice(0, cfg.maxBytes);
    truncated = true;
  }

  getRequestLogger().trace(
    {
      scope: ctx.scope,
      userId: ctx.userId ?? undefined,
      conversationId: ctx.conversationId ?? undefined,
      messageId: ctx.messageId ?? undefined,
      classify: ctx.classify ?? undefined,
      outboxId: ctx.outboxId ?? undefined,
      payload: serialized,
      truncated
    },
    "Payload sample"
  );
}

/**
 * 仅当 payload 采样总开关已开启时为 true。可用于"只在需要时才构造昂贵 payload
 * 序列化"的极少数 hot path。一般直接调用 logPayload 即可。
 */
export function isPayloadLoggingEnabled(): boolean {
  return getConfig().enabled;
}
