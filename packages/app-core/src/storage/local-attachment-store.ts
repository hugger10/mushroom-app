/**
 * `LocalAttachmentStore` — 跨端自有存储（"outbox"）抽象。
 *
 * 设计目标：让"发送中 / 失败"的附件原文件 + 缩略图能在 App 自有存储中
 * 长期存活，跨刷新、跨进程重启、跨网络断连，保证 UI 永远能渲染缩略图
 * 且失败时可重试上传（无须用户重新选择文件）。对齐 WhatsApp / Telegram /
 * 微信 行为。
 *
 * 各端实现：
 * - Web                : IndexedDB（数据库 `mushroom-outbox` / store `attachments`），500MB LRU。
 * - Electron 渲染进程  : IPC → 主进程 `<userData>/outbox/<uid>/<client_message_id>/`。
 * - Mobile             : `getMobileOutboxRoot()`/<client_message_id>/{source.<ext>, thumb.jpg}。
 *
 * 接口故意做得"足够薄"，避免把平台细节泄漏进核心服务。
 */

/**
 * 持久化前的源数据。
 *
 * - `bytes` : 已读入内存的 ArrayBuffer / Uint8Array / Blob，适合 Web 缩略图。
 * - `path`  : 本地文件路径（mobile `file://` 或 electron 绝对路径），主进程实现可走
 *             零拷贝 `fs.copyFile`。
 * - `url`   : 临时可访问的 URL（如 `blob:`、`content://`），实现可按需读取。
 */
export type LocalAttachmentSource =
  | { kind: "bytes"; bytes: ArrayBuffer | Uint8Array | Blob; mimeType?: string }
  | { kind: "path"; path: string; mimeType?: string }
  | { kind: "url"; url: string; mimeType?: string };

/**
 * 写入语义。
 *
 * - `source`  : 用于实际上传的原文件，体积较大；ACK 后由 message-send-service
 *               异步释放。
 * - `preview` : 缩略图，体积小；保留更久（直到列表滚走 / 用户手动清理 / 孤儿扫描）。
 */
export type LocalAttachmentSlot = "source" | "preview";

export interface LocalAttachmentPutOptions {
  clientMessageId: string;
  slot: LocalAttachmentSlot;
  source: LocalAttachmentSource;
  /** 文件后缀（不含点），用于 mobile 端落盘命名 `source.<ext>`。 */
  extension?: string;
}

/**
 * 通过 ref 读取已持久化的源。返回平台原生的"可上传"句柄：
 *
 * - Web / Electron 渲染进程 IPC : 返回 `Blob`。
 * - Mobile                       : 返回 `file://` URI 字符串。
 * - Electron 主进程              : 返回绝对文件路径。
 *
 * 上层 `ChunkedUploader` 的 adapter 根据自身平台决定如何消费。
 */
export type LocalAttachmentHandle =
  | { kind: "blob"; blob: Blob; mimeType?: string; size: number }
  | { kind: "path"; path: string; mimeType?: string; size: number }
  | { kind: "url"; url: string; mimeType?: string; size: number };

export interface LocalAttachmentStore {
  /**
   * 写入一个 source 或 preview，返回可保存到消息记录的 ref 字符串。
   * ref 的具体格式由实现自行决定（IndexedDB key / file path），上层只把它当
   * 不透明字符串保存到 `local_source_ref` / `local_preview_ref`。
   */
  put(options: LocalAttachmentPutOptions): Promise<string>;

  /**
   * 根据 ref 读出可上传句柄。若 ref 失效（被系统清理 / IndexedDB 项被淘汰），
   * 返回 `null`；上层据此置 `local_source_missing=true`。
   */
  get(ref: string): Promise<LocalAttachmentHandle | null>;

  /**
   * 删除 ref 对应的存储项。删除不存在的 ref 应当幂等（不抛错）。
   */
  delete(ref: string): Promise<void>;

  /**
   * 孤儿清理：扫描存储中所有项，删除不在 `activeRefs` 集合内的条目。
   * 由 startup-recovery 在 App 启动时调用。
   */
  sweep(activeRefs: ReadonlySet<string>): Promise<void>;
}

/**
 * 占位实现：当某端尚未接入持久化层时，core 仍可正常工作（所有写入操作
 * 视为成功但不真正持久化；读取永远返回 null，相当于 ref 失效）。
 *
 * 这让 message-send-service 可以无脑调用，不需要每处都做 store 是否存在
 * 的判断。
 */
export class NoopLocalAttachmentStore implements LocalAttachmentStore {
  async put(): Promise<string> {
    // 返回空字符串表示未实际持久化；上层根据空字符串决定是否写 ref 字段。
    return "";
  }

  async get(): Promise<LocalAttachmentHandle | null> {
    return null;
  }

  async delete(): Promise<void> {
    // no-op
  }

  async sweep(): Promise<void> {
    // no-op
  }
}
