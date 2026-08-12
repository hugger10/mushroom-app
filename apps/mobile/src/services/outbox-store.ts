import * as RNFS from "react-native-fs";
import type {
  LocalAttachmentHandle,
  LocalAttachmentPutOptions,
  LocalAttachmentSource,
  LocalAttachmentStore
} from "@mushroom/app-core";
import { getMobileOutboxRoot } from "../platform/media-cache";
import log from "../utils/log";

const storeLog = log.scope("outbox-store");

/**
 * Mobile 端 `LocalAttachmentStore` 实现：基于 RNFS 落盘到
 * `<getMobileOutboxRoot()>/<client_message_id>/{source.<ext>,thumb.jpg}`。
 *
 * 设计要点：
 * - ref 直接采用绝对路径字符串，便于 `RNFS.read` / `RNFS.stat` 与 ChunkedUploader
 *   adapter 直接消费（`createRNAdapter` 接受 `file://` URI / 绝对路径）。
 * - 写入采用 `RNFS.copyFile`（path 源）或 base64 写（bytes 源），失败抛出由上层
 *   `MessageSendService.persistLocalAttachment` 吞掉。
 * - delete 幂等；同时尝试清理空的消息目录，避免残留。
 * - sweep 遍历 outbox 根目录下所有"消息目录"，将不在 activeRefs 集合中的文件
 *   全部删除（按文件路径精确匹配）。
 *
 * 注意：outbox 根路径随 `accountNamespace` 切换；登出 + wipeLocalData 时
 * 由 `app-runtime.ts` 统一 `RNFS.unlink(outboxRoot)` 清理，本 store 无需感知。
 */
export class MobileOutboxStore implements LocalAttachmentStore {
  async put(options: LocalAttachmentPutOptions): Promise<string> {
    const root = getMobileOutboxRoot();
    const dir = `${root}/${sanitizeClientMessageId(options.clientMessageId)}`;
    // 双保险：拼出来的目录必须仍在 root 之下，防御性兜底（理论上 sanitize
    // 已剥离所有路径分隔符与 `..`）。
    if (!isInsideRoot(dir, root)) {
      throw new Error("outbox put: resolved path escapes outbox root");
    }
    await RNFS.mkdir(dir);

    const filename =
      options.slot === "source"
        ? `source.${sanitizeExtension(options.extension) || "bin"}`
        : "thumb.jpg";
    const destPath = `${dir}/${filename}`;

    // 若已存在同名文件（重试场景），先删除再写，避免 copyFile 在部分平台报错。
    try {
      if (await RNFS.exists(destPath)) {
        await RNFS.unlink(destPath);
      }
    } catch {
      // ignore
    }

    await writeSource(options.source, destPath);
    return destPath;
  }

  async get(ref: string): Promise<LocalAttachmentHandle | null> {
    if (!ref) return null;
    try {
      const exists = await RNFS.exists(ref);
      if (!exists) return null;
      const stat = await RNFS.stat(ref);
      return {
        kind: "path",
        path: ref,
        size: Number(stat.size) || 0
      };
    } catch (err) {
      storeLog.warn("outbox-store get failed", { ref, err });
      return null;
    }
  }

  async delete(ref: string): Promise<void> {
    if (!ref) return;
    const root = getMobileOutboxRoot();
    // 拒绝指向 outbox 根之外的路径，防御性兜底。
    if (!isInsideRoot(ref, root)) {
      storeLog.warn("outbox-store delete rejected: ref outside root", { ref });
      return;
    }
    try {
      if (await RNFS.exists(ref)) {
        await RNFS.unlink(ref);
      }
      // best-effort 清理空目录；用 isInsideRoot + 严格不等于 root 双重保护。
      const parent = parentDir(ref);
      if (parent && parent !== root && isInsideRoot(parent, root)) {
        try {
          const entries = await RNFS.readDir(parent);
          if (entries.length === 0) {
            await RNFS.unlink(parent);
          }
        } catch {
          // ignore
        }
      }
    } catch (err) {
      storeLog.warn("outbox-store delete failed", { ref, err });
    }
  }

  async sweep(activeRefs: ReadonlySet<string>): Promise<void> {
    const root = getMobileOutboxRoot();
    let exists = false;
    try {
      exists = await RNFS.exists(root);
    } catch {
      return;
    }
    if (!exists) return;

    let messageDirs: RNFS.ReadDirItem[] = [];
    try {
      messageDirs = await RNFS.readDir(root);
    } catch {
      return;
    }

    for (const entry of messageDirs) {
      if (!entry.isDirectory()) continue;
      if (!isInsideRoot(entry.path, root)) continue;
      let files: RNFS.ReadDirItem[] = [];
      try {
        files = await RNFS.readDir(entry.path);
      } catch {
        continue;
      }
      for (const file of files) {
        if (!isInsideRoot(file.path, root)) continue;
        if (activeRefs.has(file.path)) continue;
        try {
          await RNFS.unlink(file.path);
        } catch {
          // ignore
        }
      }
      // 目录被清空则一并删除
      try {
        const remain = await RNFS.readDir(entry.path);
        if (remain.length === 0) {
          await RNFS.unlink(entry.path);
        }
      } catch {
        // ignore
      }
    }
  }
}

function sanitizeExtension(ext?: string): string {
  if (!ext) return "";
  return ext
    .replace(/^\./, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 8);
}

/**
 * 把 `client_message_id` 净化成可作目录名的形式：
 * - `createClientMessageId()` 返回 `msg:<ts>:<rand>`，`:` 在大部分平台路径
 *   合法但语义混淆，且与 web/Electron 端 outbox sanitize 行为对齐；
 * - 限制字符集 + 长度，防御性避免 `..`、`/`、空字节等。
 */
function sanitizeClientMessageId(id: string): string {
  return String(id)
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 96);
}

/**
 * 用规范化的字符串前缀判断 `child` 是否位于 `root` 之下；保证 root 末尾
 * 有 `/` 后再比较，避免 `/foo/outbox-evil` 被误判进 `/foo/outbox`。
 */
function isInsideRoot(child: string, root: string): boolean {
  if (!child || !root) return false;
  const normalizedRoot = root.endsWith("/") ? root : `${root}/`;
  return child === root || child.startsWith(normalizedRoot);
}

function parentDir(p: string): string {
  const idx = p.lastIndexOf("/");
  return idx > 0 ? p.slice(0, idx) : "";
}

function stripFileScheme(uri: string): string {
  return uri.replace(/^file:\/\//, "");
}

async function writeSource(
  source: LocalAttachmentSource,
  destPath: string
): Promise<void> {
  if (source.kind === "path") {
    await RNFS.copyFile(stripFileScheme(source.path), destPath);
    return;
  }
  if (source.kind === "url") {
    // file:// 与 content:// 走 copyFile（react-native-fs 在 Android 支持
    // content:// 的 copyFile）；其它 scheme 当前不支持，让上层走回退路径。
    if (
      source.url.startsWith("file://") ||
      source.url.startsWith("content://")
    ) {
      await RNFS.copyFile(stripFileScheme(source.url), destPath);
      return;
    }
    throw new Error(`unsupported source url: ${source.url}`);
  }
  // bytes
  const base64 = await blobLikeToBase64(source.bytes);
  await RNFS.writeFile(destPath, base64, "base64");
}

async function blobLikeToBase64(
  bytes: ArrayBuffer | Uint8Array | Blob
): Promise<string> {
  if (bytes instanceof Uint8Array) {
    return uint8ToBase64(bytes);
  }
  if (bytes instanceof ArrayBuffer) {
    return uint8ToBase64(new Uint8Array(bytes));
  }
  // Blob 在 RN 中支持有限；FileReader.readAsDataURL 是最稳路径。
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("read blob fail"));
    reader.onload = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(bytes as Blob);
  });
}

function uint8ToBase64(bytes: Uint8Array): string {
  // 分块以避免 String.fromCharCode.apply 的栈溢出。
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunk))
    );
  }
  // RN 全局 btoa 存在；Hermes 也支持。
  return (globalThis as unknown as { btoa: (s: string) => string }).btoa(
    binary
  );
}
