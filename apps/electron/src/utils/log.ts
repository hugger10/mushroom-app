// This module is the electron-side logger. It intentionally bridges to
// electron-log; downstream code should import this default export rather
// than touching `console` directly.
import electronLog from "electron-log/main";
import { app } from "electron";
import path from "path";
import fs from "fs";
import {
  createLogger,
  createConsoleTransport,
  stringifyArgSingleLine,
  type LogLevel,
  type LogRecord,
  type LogTransport,
  type Logger
} from "@mushroom/shared/logger";

// 是否把日志参数压成单行（对象走 JSON.stringify，字符串里的 \n 转义为字面 \n）。
// 默认 true，主进程和经 IPC 汇入的 renderer 日志都会受此开关影响。
// 一般不需要改；如需临时观察对象的多行 util.inspect 输出，把这里改成
// false 并重启 electron 即可。不读环境变量、不暴露运行时 API。
const LOG_SINGLE_LINE = true;

const VALID_LEVELS: LogLevel[] = ["debug", "info", "warn", "error"];

function parseLevel(raw: string | undefined, fallback: LogLevel): LogLevel {
  if (!raw) return fallback;
  const normalized = raw.trim().toLowerCase() as LogLevel;
  return VALID_LEVELS.includes(normalized) ? normalized : fallback;
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function formatDateStr(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

const ELECTRON_LOG_FORMAT =
  "[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {scope} {text}";

function resolveLogsDir(): string {
  return path.join(app.getPath("userData"), "logs");
}

function cleanupExpiredFiles(dir: string, retentionDays: number): void {
  if (retentionDays <= 0) return;
  try {
    const entries = fs.readdirSync(dir);
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    const pattern = /^(\d{4})-(\d{2})-(\d{2})\.log$/;
    for (const name of entries) {
      const m = pattern.exec(name);
      if (!m) continue;
      const fileDate = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      if (fileDate < cutoff) {
        try {
          fs.unlinkSync(path.join(dir, name));
        } catch {
          /* noop */
        }
      }
    }
  } catch {
    /* noop */
  }
}

let configured = false;

function configureElectronLog(): void {
  if (configured) return;
  const maxFileMb = parsePositiveInt(process.env.LOG_MAX_FILE_MB, 50);
  const level = parseLevel(
    process.env.LOG_LEVEL,
    app.isPackaged ? "info" : "debug"
  );
  const retentionDays = parsePositiveInt(process.env.LOG_RETENTION_DAYS, 14);

  electronLog.transports.file.level = level;
  electronLog.transports.console.level = level;
  electronLog.transports.file.maxSize = maxFileMb * 1024 * 1024;
  electronLog.transports.file.format = ELECTRON_LOG_FORMAT;
  electronLog.transports.console.format = ELECTRON_LOG_FORMAT;

  const logsDir = resolveLogsDir();
  ensureDir(logsDir);

  electronLog.transports.file.resolvePathFn = () =>
    path.join(logsDir, `${formatDateStr()}.log`);

  cleanupExpiredFiles(logsDir, retentionDays);

  configured = true;
}

function callElectronLog(
  level: LogLevel,
  message: string,
  args: unknown[]
): void {
  const fn = electronLog[level];
  if (typeof fn !== "function") return;
  if (!LOG_SINGLE_LINE) {
    fn(message, ...args);
    return;
  }
  const flat = args.map(a =>
    typeof a === "string"
      ? a.replace(/\r?\n/g, "\\n")
      : stringifyArgSingleLine(a)
  );
  fn(message, ...flat);
}

function createElectronLogTransport(): LogTransport {
  return {
    name: "electron-log",
    write(record: LogRecord): void {
      const scope = record.scope ?? "main";
      const message = `[${scope}] ${record.message}`;
      callElectronLog(record.level, message, record.args);
    }
  };
}

interface ElectronAppLogger extends Logger {
  /**
   * Initialize electron-log in the main process and bind file/console transports.
   * Must be called once after app is ready (or as early as possible).
   */
  initialize(): void;
}

const baseLogger = createLogger({
  // Start with a permissive level so any logs emitted before initialize() are kept.
  // initialize() will reconcile to the env-configured level.
  level: "debug",
  transports: [createElectronLogTransport()]
});

function initialize(): void {
  electronLog.initialize();
  configureElectronLog();
  const level = parseLevel(
    process.env.LOG_LEVEL,
    app.isPackaged ? "info" : "debug"
  );
  baseLogger.setLevel(level);
}

const log: ElectronAppLogger = Object.assign(baseLogger, { initialize });

export default log;
export { createElectronLogTransport, createConsoleTransport };
