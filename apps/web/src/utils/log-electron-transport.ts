// Transport that forwards renderer-side log records to the Electron main
// process over IPC, where they are picked up by the shared electron-log
// transport and written to the same daily log file as main-process logs.
//
// The transport is only attached when running inside Electron (i.e. when
// `window.electronAPI.logWrite` has been injected by the preload bridge);
// in a pure browser environment the renderer falls back to the console
// transport only.
import type { LogRecord, LogTransport } from "@mushroom/shared/logger";

const MAX_DEPTH = 4;

/**
 * Serialize a log argument into something `ipcRenderer.send` can carry
 * across the structured-clone boundary. Errors become plain objects with
 * `message` / `name` / `stack`; circular references and unknown classes
 * are replaced with their `String(...)` form.
 */
function safeSerialize(
  value: unknown,
  depth = 0,
  seen = new WeakSet()
): unknown {
  if (value === null || value === undefined) return value;
  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") return value;
  if (t === "bigint") return value.toString();
  if (t === "function" || t === "symbol") return String(value);

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack
    };
  }

  if (depth >= MAX_DEPTH) return String(value);

  if (Array.isArray(value)) {
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    return value.map(item => safeSerialize(item, depth + 1, seen));
  }

  if (t === "object") {
    if (seen.has(value as object)) return "[Circular]";
    seen.add(value as object);
    const out: Record<string, unknown> = {};
    try {
      for (const key of Object.keys(value as Record<string, unknown>)) {
        out[key] = safeSerialize(
          (value as Record<string, unknown>)[key],
          depth + 1,
          seen
        );
      }
    } catch {
      return String(value);
    }
    return out;
  }

  return String(value);
}

type LogWriteBridge = (record: {
  level: LogRecord["level"];
  scope?: string;
  message: string;
  args: unknown[];
  timestamp: number;
}) => void;

function resolveBridge(): LogWriteBridge | null {
  if (typeof window === "undefined") return null;
  const api = (
    window as unknown as {
      electronAPI?: { logWrite?: LogWriteBridge };
    }
  ).electronAPI;
  if (!api || typeof api.logWrite !== "function") return null;
  return api.logWrite;
}

export function createElectronIpcTransport(): LogTransport | null {
  const bridge = resolveBridge();
  if (!bridge) return null;
  return {
    name: "electron-ipc",
    write(record) {
      try {
        bridge({
          level: record.level,
          scope: record.scope,
          message: record.message,
          args: record.args.map(arg => safeSerialize(arg)),
          timestamp: record.timestamp
        });
      } catch {
        // Logging must never crash the renderer.
      }
    }
  };
}
