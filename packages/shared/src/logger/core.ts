import type {
  CreateLoggerOptions,
  LogLevel,
  LogRecord,
  LogTransport,
  Logger
} from "./types";
import { LOG_LEVEL_WEIGHT } from "./types";

interface LoggerState {
  level: LogLevel;
  transports: LogTransport[];
}

function shouldEmit(
  state: LoggerState,
  transport: LogTransport,
  level: LogLevel
): boolean {
  const minWeight = LOG_LEVEL_WEIGHT[transport.level ?? state.level];
  return LOG_LEVEL_WEIGHT[level] >= minWeight;
}

function joinScope(parent: string | undefined, child: string): string {
  if (!parent) return child;
  return `${parent}:${child}`;
}

function buildLogger(state: LoggerState, scope: string | undefined): Logger {
  function emit(level: LogLevel, message: string, args: unknown[]): void {
    // Fast path: if no transport will accept this level, skip building the record.
    let any = false;
    for (const t of state.transports) {
      if (shouldEmit(state, t, level)) {
        any = true;
        break;
      }
    }
    if (!any) return;

    const record: LogRecord = {
      level,
      scope,
      message,
      args,
      timestamp: Date.now()
    };

    for (const transport of state.transports) {
      if (!shouldEmit(state, transport, level)) continue;
      try {
        // Swallow async errors as well; we never want logging to crash callers.
        const ret = transport.write(record);
        if (ret && typeof (ret as Promise<unknown>).catch === "function") {
          (ret as Promise<unknown>).catch(() => {
            /* noop */
          });
        }
      } catch {
        /* noop: transport failures must not affect business logic */
      }
    }
  }

  const logger: Logger = {
    debug(msg, ...args) {
      emit("debug", msg, args);
    },
    info(msg, ...args) {
      emit("info", msg, args);
    },
    warn(msg, ...args) {
      emit("warn", msg, args);
    },
    error(msg, ...args) {
      emit("error", msg, args);
    },
    scope(name: string): Logger {
      return buildLogger(state, joinScope(scope, name));
    },
    setLevel(level: LogLevel): void {
      state.level = level;
    },
    getLevel(): LogLevel {
      return state.level;
    },
    addTransport(transport: LogTransport): void {
      const idx = state.transports.findIndex(t => t.name === transport.name);
      if (idx >= 0) {
        state.transports[idx] = transport;
      } else {
        state.transports.push(transport);
      }
    },
    removeTransport(name: string): void {
      const idx = state.transports.findIndex(t => t.name === name);
      if (idx >= 0) state.transports.splice(idx, 1);
    },
    async flush(): Promise<void> {
      await Promise.all(
        state.transports.map(async t => {
          if (!t.flush) return;
          try {
            await t.flush();
          } catch {
            /* noop */
          }
        })
      );
    }
  };

  return logger;
}

export function createLogger(options: CreateLoggerOptions = {}): Logger {
  const state: LoggerState = {
    level: options.level ?? "info",
    transports: options.transports ? [...options.transports] : []
  };
  return buildLogger(state, options.scope);
}
