// Mobile file transport: appends log records to dated files under
// `<DocumentDirectoryPath>/logs/`, with size-based rollover and
// age-based cleanup. All operations are serialized through a promise
// queue so concurrent writes never interleave.
import RNFS from "react-native-fs";
import {
  formatDateOnly,
  formatRecordLine,
  type LogRecord,
  type LogTransport
} from "@mushroom/shared/logger";

const FILE_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?:\.(\d+))?\.log$/;

export interface MobileFileTransportOptions {
  name?: string;
  /** Directory to write log files into. Defaults to `<Documents>/logs`. */
  dir?: string;
  /** Maximum file size in megabytes before rollover. Defaults to 5. */
  maxFileMb?: number;
  /** Retention window in days. Files older than this are deleted on init. */
  retentionDays?: number;
}

export interface MobileFileTransport extends LogTransport {
  /** Resolved log directory absolute path. */
  readonly dir: string;
  /** Force-flush the pending write queue. */
  flush(): Promise<void>;
  /** Return the absolute paths of all current log files, newest-first. */
  listFiles(): Promise<string[]>;
  /** Remove all log files. */
  clearAll(): Promise<void>;
}

function defaultDir(): string {
  return `${RNFS.DocumentDirectoryPath}/logs`;
}

function parseFileDate(name: string): Date | null {
  const m = FILE_DATE_PATTERN.exec(name);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

async function ensureDir(dir: string): Promise<void> {
  const exists = await RNFS.exists(dir);
  if (!exists) {
    await RNFS.mkdir(dir);
  }
}

async function cleanupExpired(
  dir: string,
  retentionDays: number
): Promise<void> {
  if (retentionDays <= 0) return;
  try {
    const entries = await RNFS.readDir(dir);
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const date = parseFileDate(entry.name);
      if (!date) continue;
      if (date.getTime() < cutoff) {
        try {
          await RNFS.unlink(entry.path);
        } catch {
          /* noop */
        }
      }
    }
  } catch {
    /* noop */
  }
}

interface SizeCache {
  date: string;
  index: number;
  path: string;
  size: number;
}

export function createMobileFileTransport(
  options: MobileFileTransportOptions = {}
): MobileFileTransport {
  const dir = options.dir ?? defaultDir();
  const maxBytes = Math.max(1, options.maxFileMb ?? 5) * 1024 * 1024;
  const retentionDays = Math.max(0, options.retentionDays ?? 7);

  // Serializes all FS operations to avoid append interleaving.
  let queue: Promise<unknown> = Promise.resolve();
  let initialized = false;
  let cache: SizeCache | null = null;

  async function init(): Promise<void> {
    if (initialized) return;
    initialized = true;
    await ensureDir(dir);
    await cleanupExpired(dir, retentionDays);
  }

  async function nextIndexForDate(
    date: string,
    start: number
  ): Promise<number> {
    let idx = start;
    // Find the first rolling index that is either missing or under the cap.
    // For pathological cases (corrupt fs metadata) we cap iteration to avoid
    // an unbounded loop.
    for (let attempt = 0; attempt < 1000; attempt += 1) {
      const candidate = idx === 0 ? `${date}.log` : `${date}.${idx}.log`;
      const filePath = `${dir}/${candidate}`;
      try {
        const stat = await RNFS.stat(filePath);
        const size = Number(stat.size) || 0;
        if (size < maxBytes) {
          cache = { date, index: idx, path: filePath, size };
          return idx;
        }
      } catch {
        // file missing -> start fresh here
        cache = { date, index: idx, path: filePath, size: 0 };
        return idx;
      }
      idx += 1;
    }
    // Fallback: overwrite the last one.
    const filePath = `${dir}/${date}.${idx}.log`;
    cache = { date, index: idx, path: filePath, size: 0 };
    return idx;
  }

  async function resolveTargetFile(): Promise<SizeCache> {
    const today = formatDateOnly();
    if (cache && cache.date === today && cache.size < maxBytes) {
      return cache;
    }
    if (!cache || cache.date !== today) {
      await nextIndexForDate(today, 0);
    } else {
      await nextIndexForDate(today, cache.index + 1);
    }
    return cache!;
  }

  async function appendLine(line: string): Promise<void> {
    await init();
    const target = await resolveTargetFile();
    const payload = `${line}\n`;
    try {
      await RNFS.appendFile(target.path, payload, "utf8");
      target.size += payload.length;
    } catch {
      // Surface failures only in __DEV__; never throw to callers.
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.warn("[log-file-transport] append failed", target.path);
      }
    }
  }

  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const next = queue.then(task, task);
    queue = next.catch(() => {
      /* swallow */
    });
    return next;
  }

  return {
    name: options.name ?? "mobile-file",
    get dir() {
      return dir;
    },
    write(record: LogRecord): void {
      const line = formatRecordLine(record);
      enqueue(() => appendLine(line));
    },
    async flush(): Promise<void> {
      await queue;
    },
    async listFiles(): Promise<string[]> {
      await init();
      const entries = await RNFS.readDir(dir);
      return entries
        .filter(e => e.isFile() && FILE_DATE_PATTERN.test(e.name))
        .sort((a, b) => (a.name < b.name ? 1 : -1))
        .map(e => e.path);
    },
    async clearAll(): Promise<void> {
      await init();
      const entries = await RNFS.readDir(dir);
      await Promise.all(
        entries
          .filter(e => e.isFile() && FILE_DATE_PATTERN.test(e.name))
          .map(async e => {
            try {
              await RNFS.unlink(e.path);
            } catch {
              /* noop */
            }
          })
      );
      cache = null;
    }
  };
}
