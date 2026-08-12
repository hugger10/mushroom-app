export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogRecord {
  level: LogLevel;
  scope?: string;
  message: string;
  args: unknown[];
  timestamp: number;
}

export interface LogTransport {
  name: string;
  level?: LogLevel;
  write(record: LogRecord): void | Promise<void>;
  flush?(): Promise<void>;
}

export interface Logger {
  debug(msg: string, ...args: unknown[]): void;
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
  scope(name: string): Logger;
  setLevel(level: LogLevel): void;
  getLevel(): LogLevel;
  addTransport(transport: LogTransport): void;
  removeTransport(name: string): void;
  flush(): Promise<void>;
}

export interface CreateLoggerOptions {
  level?: LogLevel;
  scope?: string;
  transports?: LogTransport[];
}

export const LOG_LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

export function compareLogLevel(a: LogLevel, b: LogLevel): number {
  return LOG_LEVEL_WEIGHT[a] - LOG_LEVEL_WEIGHT[b];
}
