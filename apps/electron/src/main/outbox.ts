import { ipcMain } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getAccountOutboxRoot } from "./runtime-paths";
import { getCurrentUserId } from "./database";

/**
 * Electron 主进程 outbox 文件 IPC。
 *
 * 与 mobile 的 `MobileOutboxStore` 语义对齐：
 *   `<userData>/users/<uid>/outbox/<client_message_id>/{source.<ext>,thumb.jpg}`。
 *
 * ref 形态：返回**绝对路径字符串**，渲染进程透明传递；下次需要通过 `get`
 * 拿回内容时主进程直接 `fs.readFile` 给回 ArrayBuffer。
 *
 * IPC channel：
 *   - outbox:put     ({ clientMessageId, slot, extension, mimeType, data }) -> ref
 *   - outbox:get     (ref)        -> { data: ArrayBuffer, mimeType, size } | null
 *   - outbox:delete  (ref)        -> void
 *   - outbox:sweep   ({ activeRefs }) -> void
 *
 * **安全约束（重要）**：
 * - `uid` 不接受渲染端传入，统一从主进程 `getCurrentUserId()` 解析；多账户
 *   隔离由主进程独有的 single source of truth 保证。
 * - 所有 ref 入口（put/get/delete/sweep）必须 `isInside(ref, root)`：防止
 *   被 XSS / 恶意 IPC 读写主进程权限范围内的任意文件（如 /etc/passwd 或
 *   其他账户的 outbox）。
 * - `sanitizeClientMessageId` 把 `:` 替换为 `_`，避开 Windows NTFS 与 macOS
 *   HFS 对 `:` 的限制（`createClientMessageId` 默认返回 `msg:<ts>:<rand>`）。
 *
 * TODO(perf)：大附件（数十 MB+ 视频）当前会被结构化克隆全量复制过 IPC
 * 边界，渲染进程内存翻倍。后续可考虑 `<input type=file>` path 直读 + zero-copy。
 *
 * 所有 IO 都在主进程完成，避免渲染进程文件权限差异；幂等、best-effort
 * （内部 try/catch 吞错，返回 null/空字符串）。
 */

type Slot = "source" | "preview";

interface OutboxPutInput {
  clientMessageId: string;
  slot: Slot;
  extension?: string;
  mimeType?: string;
  data: ArrayBuffer | Uint8Array;
}

interface OutboxGetResult {
  data: ArrayBuffer;
  mimeType?: string;
  size: number;
}

function sanitizeExtension(ext?: string): string {
  if (!ext) return "";
  return ext
    .replace(/^\./, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 8);
}

function sanitizeClientMessageId(id: string): string {
  // 客户端 `createClientMessageId()` 返回 `msg:<ts>:<rand>`；`:` 在 Windows
  // NTFS / macOS HFS 文件名中非法，必须替换。仅允许 [A-Za-z0-9_-]。
  return String(id)
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 96);
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

function isInside(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  return Boolean(rel) && !rel.startsWith("..") && !path.isAbsolute(rel);
}

/**
 * 解析当前账户的 outbox root；未登录或 ref 越界返回 null。所有 ref 入口
 * 都必须先过这一关，禁止信任渲染端传入的任意路径。
 */
function resolveCurrentAccountOutboxRoot(): string | null {
  const uid = getCurrentUserId();
  if (!uid) return null;
  return getAccountOutboxRoot(uid);
}

function assertRefInsideAccountOutbox(ref: string): string | null {
  if (!ref || typeof ref !== "string") return null;
  const root = resolveCurrentAccountOutboxRoot();
  if (!root) return null;
  return isInside(ref, root) ? root : null;
}

export function setupOutboxIpcHandlers(): void {
  ipcMain.handle(
    "outbox:put",
    async (_event, input: OutboxPutInput): Promise<string> => {
      const root = resolveCurrentAccountOutboxRoot();
      if (!root) return "";
      const messageDir = path.join(
        root,
        sanitizeClientMessageId(input.clientMessageId)
      );
      // 双保险：拼路径后再校验，避免任何意外把 dest 拉出 root。
      if (!isInside(messageDir, root) && messageDir !== root) return "";
      await ensureDir(messageDir);
      const filename =
        input.slot === "source"
          ? `source.${sanitizeExtension(input.extension) || "bin"}`
          : "thumb.jpg";
      const dest = path.join(messageDir, filename);
      if (!isInside(dest, root)) return "";
      const buffer =
        input.data instanceof Uint8Array
          ? Buffer.from(
              input.data.buffer,
              input.data.byteOffset,
              input.data.byteLength
            )
          : Buffer.from(input.data);
      await fs.writeFile(dest, buffer);
      return dest;
    }
  );

  ipcMain.handle(
    "outbox:get",
    async (_event, ref: string): Promise<OutboxGetResult | null> => {
      // 安全：拒绝任何指向当前账户 outbox 之外的路径。
      if (!assertRefInsideAccountOutbox(ref)) return null;
      try {
        const stat = await fs.stat(ref);
        if (!stat.isFile()) return null;
        const buffer = await fs.readFile(ref);
        // 转成可结构化克隆传给渲染进程的 ArrayBuffer。
        const ab = buffer.buffer.slice(
          buffer.byteOffset,
          buffer.byteOffset + buffer.byteLength
        ) as ArrayBuffer;
        return { data: ab, size: stat.size };
      } catch {
        return null;
      }
    }
  );

  ipcMain.handle(
    "outbox:delete",
    async (_event, ref: string): Promise<void> => {
      // 安全：拒绝任何指向当前账户 outbox 之外的路径。
      const root = assertRefInsideAccountOutbox(ref);
      if (!root) return;
      try {
        await fs.unlink(ref);
        // 顺手清理空目录。
        const parent = path.dirname(ref);
        if (isInside(parent, root)) {
          try {
            const entries = await fs.readdir(parent);
            if (entries.length === 0) {
              await fs.rmdir(parent);
            }
          } catch {
            // ignore
          }
        }
      } catch {
        // ignore
      }
    }
  );

  ipcMain.handle(
    "outbox:sweep",
    async (_event, input: { activeRefs: string[] }): Promise<void> => {
      const root = resolveCurrentAccountOutboxRoot();
      if (!root) return;
      let messageDirs: string[] = [];
      try {
        messageDirs = await fs.readdir(root);
      } catch {
        return;
      }
      const activeSet = new Set(input?.activeRefs || []);
      for (const dirName of messageDirs) {
        const dirPath = path.join(root, dirName);
        if (!isInside(dirPath, root)) continue;
        let files: string[] = [];
        try {
          const stat = await fs.stat(dirPath);
          if (!stat.isDirectory()) continue;
          files = await fs.readdir(dirPath);
        } catch {
          continue;
        }
        for (const file of files) {
          const filePath = path.join(dirPath, file);
          if (!isInside(filePath, root)) continue;
          if (activeSet.has(filePath)) continue;
          try {
            await fs.unlink(filePath);
          } catch {
            // ignore
          }
        }
        try {
          const remain = await fs.readdir(dirPath);
          if (remain.length === 0) {
            await fs.rmdir(dirPath);
          }
        } catch {
          // ignore
        }
      }
    }
  );
}
