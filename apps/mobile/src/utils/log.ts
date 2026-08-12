// Mobile logger entry. Always import `log` from here instead of using
// `console.*` directly so log scopes, levels and file transport remain
// uniform across the app.
import Config from "react-native-config";
import {
  createConsoleTransport,
  createLogger,
  type LogLevel,
  type Logger
} from "@mushroom/shared/logger";
import {
  createMobileFileTransport,
  type MobileFileTransport
} from "./log-file-transport";

const VALID_LEVELS: LogLevel[] = ["debug", "info", "warn", "error"];

function parseLevel(raw: string | undefined, fallback: LogLevel): LogLevel {
  if (!raw) return fallback;
  const normalized = raw.trim().toLowerCase() as LogLevel;
  return VALID_LEVELS.includes(normalized) ? normalized : fallback;
}

function parseBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw === null || raw === "") return fallback;
  const normalized = String(raw).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const initialLevel = parseLevel(
  Config.LOG_LEVEL,
  typeof __DEV__ !== "undefined" && __DEV__ ? "debug" : "info"
);

const logToFile = parseBool(Config.LOG_TO_FILE, true);
const maxFileMb = parsePositiveInt(Config.LOG_MAX_FILE_MB, 5);
const retentionDays = parsePositiveInt(Config.LOG_RETENTION_DAYS, 7);

let fileTransport: MobileFileTransport | null = null;
let initialized = false;

const baseLogger: Logger = createLogger({
  level: initialLevel,
  transports: [createConsoleTransport()]
});

/**
 * Initialize the mobile logger. Safe to call multiple times; only the first
 * call has effect. Should be called as early as possible in app startup
 * (e.g. at the top of `index.js`).
 */
export function initLogger(): void {
  if (initialized) return;
  initialized = true;
  if (!logToFile) return;
  try {
    fileTransport = createMobileFileTransport({
      maxFileMb,
      retentionDays
    });
    baseLogger.addTransport(fileTransport);
  } catch (err) {
    // Logger must never crash app startup.
    if (typeof __DEV__ !== "undefined" && __DEV__) {
      console.warn("[logger] failed to attach file transport", err);
    }
  }
}

/**
 * Return absolute paths of all log files (newest first).
 * Resolves to an empty array if file transport is disabled.
 */
export async function exportLogs(): Promise<string[]> {
  if (!fileTransport) return [];
  await fileTransport.flush();
  try {
    return await fileTransport.listFiles();
  } catch {
    return [];
  }
}

/** Delete all on-disk log files. */
export async function clearAllLogs(): Promise<void> {
  if (!fileTransport) return;
  await fileTransport.clearAll();
}

/** Force-flush pending file writes. */
export async function flushLogs(): Promise<void> {
  await baseLogger.flush();
}

export default baseLogger;
