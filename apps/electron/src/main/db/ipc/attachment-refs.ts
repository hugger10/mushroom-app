import { ipcMain } from "electron";
import { getDb } from "../connection";

/**
 * 收集"所有 message 行中仍被引用的 outbox refs"（messages 表内的
 * `content.local_source_ref` / `content.local_preview_ref`）。
 *
 * 启动 sweep 用：把 outbox 目录里**不在 active 集合中的**文件清理掉，
 * 同时确保任何 status=-1 但已从 outgoing_messages 队列移除的失败附件
 * 仍能被识别为"活跃 ref"，避免它们被 sweep 误删 → 用户重试时出现
 * `local_source_missing=true`。
 *
 * 设计取舍：在 SQL 层用 `json_extract` 提取 ref，比把所有 message 行
 * 拉到 JS 反序列化便宜得多（O(N) → 仅扫一次）。返回的 refs 已去重。
 */
export function registerAttachmentRefsHandlers(): void {
  ipcMain.handle("attachments:list-local-refs", async (): Promise<string[]> => {
    const db = getDb();
    if (!db) return [];
    try {
      const rows = db
        .prepare(
          `SELECT
               json_extract(content, '$.local_source_ref')  AS source_ref,
               json_extract(content, '$.local_preview_ref') AS preview_ref
             FROM messages
             WHERE type = 2
               AND (
                 json_extract(content, '$.local_source_ref')  IS NOT NULL
                 OR json_extract(content, '$.local_preview_ref') IS NOT NULL
               )`
        )
        .all() as Array<{
        source_ref: string | null;
        preview_ref: string | null;
      }>;
      const out = new Set<string>();
      for (const row of rows) {
        if (row.source_ref) out.add(row.source_ref);
        if (row.preview_ref) out.add(row.preview_ref);
      }
      return Array.from(out);
    } catch {
      return [];
    }
  });
}
