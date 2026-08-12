import type { LogLevel, LogRecord, LogTransport } from "./types";

export interface ConsoleTransportOptions {
  name?: string;
  level?: LogLevel;
  /** Provide a custom console-like object, mainly for testing. */
  console?: Pick<Console, "debug" | "info" | "warn" | "error" | "log">;
}

/**
 * A simple transport that forwards records to the global `console`.
 * Suitable as a default sink for web/electron/mobile.
 */
export function createConsoleTransport(
  options: ConsoleTransportOptions = {}
): LogTransport {
  const target = options.console ?? globalThis.console;
  return {
    name: options.name ?? "console",
    level: options.level,
    write(record: LogRecord): void {
      const scope = record.scope ? `[${record.scope}] ` : "";
      const message = `${scope}${record.message}`;
      const fn =
        record.level === "debug"
          ? (target.debug ?? target.log)
          : record.level === "info"
            ? (target.info ?? target.log)
            : record.level === "warn"
              ? target.warn
              : target.error;
      try {
        fn.call(target, message, ...record.args);
      } catch {
        /* noop */
      }
    }
  };
}
