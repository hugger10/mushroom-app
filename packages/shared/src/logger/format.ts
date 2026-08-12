import type { LogLevel, LogRecord } from "./types";

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function pad3(n: number): string {
  if (n < 10) return `00${n}`;
  if (n < 100) return `0${n}`;
  return `${n}`;
}

/**
 * Format timestamp as `YYYY-MM-DD HH:mm:ss.SSS` in local time.
 * Mirrors the format used by `apps/electron/src/utils/log.ts`.
 */
export function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  return (
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ` +
    `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}.${pad3(d.getMilliseconds())}`
  );
}

/** Format a YYYY-MM-DD date string in local time. */
export function formatDateOnly(ts: number = Date.now()): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function formatLevel(level: LogLevel): string {
  return level.toUpperCase();
}

/**
 * Single-line serializer for log arguments. Guarantees the result contains
 * no newline characters so downstream sinks (e.g. electron-log) don't pretty
 * print objects across multiple lines.
 *
 * - `string` is returned as-is (callers that need newline escaping should do
 *   it themselves; this keeps already-formatted strings untouched).
 * - `Error` is serialized as `{name, message, stack}` JSON with `\n` in the
 *   stack escaped to the literal characters `\n` so the whole record stays
 *   on one line while still preserving the stack content.
 * - Plain objects / arrays go through `JSON.stringify` (single-line by
 *   default). Failures fall back to `String(arg)`, then `[Unserializable]`.
 */
export function stringifyArgSingleLine(arg: unknown): string {
  if (arg === undefined) return "undefined";
  if (arg === null) return "null";
  if (typeof arg === "string") return arg;
  if (
    typeof arg === "number" ||
    typeof arg === "boolean" ||
    typeof arg === "bigint"
  ) {
    return String(arg);
  }
  if (arg instanceof Error) {
    const stack = arg.stack ? arg.stack.replace(/\r?\n/g, "\\n") : undefined;
    try {
      return JSON.stringify({
        name: arg.name,
        message: arg.message,
        stack
      });
    } catch {
      return `${arg.name}: ${arg.message}`;
    }
  }
  try {
    return JSON.stringify(arg);
  } catch {
    try {
      return String(arg);
    } catch {
      return "[Unserializable]";
    }
  }
}

function safeStringifyArg(arg: unknown): string {
  if (arg === undefined) return "undefined";
  if (arg === null) return "null";
  if (typeof arg === "string") return arg;
  if (
    typeof arg === "number" ||
    typeof arg === "boolean" ||
    typeof arg === "bigint"
  ) {
    return String(arg);
  }
  if (arg instanceof Error) {
    return arg.stack || `${arg.name}: ${arg.message}`;
  }
  try {
    return JSON.stringify(arg);
  } catch {
    try {
      return String(arg);
    } catch {
      return "[Unserializable]";
    }
  }
}

/** Format a record into a single-line string suitable for file output. */
export function formatRecordLine(record: LogRecord): string {
  const ts = formatTimestamp(record.timestamp);
  const level = formatLevel(record.level);
  const scope = record.scope ? `[${record.scope}] ` : "";
  const args =
    record.args.length > 0
      ? ` ${record.args.map(safeStringifyArg).join(" ")}`
      : "";
  return `[${ts}] [${level}] ${scope}${record.message}${args}`;
}
