/**
 * 移动端：把"附件 URL 自愈"刷新结果写回 mobile_messages.payload。
 *
 * 与桌面端 `db:update-message-attachment` 行为对齐：找到 messageId 对应的行，
 * 把 message.content（以及合并转发卡片内嵌套消息的 content）中匹配 upload_id
 * 的附件 url / thumb_url / preview_url / thumb_status 字段更新为新值。
 *
 * 设计：
 *   - 直接使用 active SQLite 连接，不走 `MobileDataRepository` 接口，避免在
 *     app-core 共享接口里引入"附件级"概念，保持改动局部化。
 *   - messageId 既可能是 client_message_id 也可能是 server_message_id，按序匹配。
 *   - 仅当真的发生字段变化时才写回，避免无谓的 UPDATE。
 *   - 任意一步异常都吞掉并记录日志：自愈持久化只是优化，失败不影响 UI 渲染。
 */

import type { Message } from "@mushroom/shared";
import { isFileMessageContent, isMergedForwardContent } from "@mushroom/shared";
import { getActiveMobileSQLiteConnection } from "./../sqlite-connection";
import { queryRows, type SQLiteRow } from "./queries";
import { safeJsonParse } from "./helpers";
import log from "../../utils/log";

const persistLog = log.scope("media");

export interface RefreshedAttachmentPatch {
  url?: string;
  thumb_url?: string;
  preview_url?: string;
  thumb_status?: "none" | "pending" | "ready" | "failed";
}

/**
 * 把单条附件 upload_id 的最新 URL 信息写回 SQLite。
 * @param messageId 可以是 client_message_id 或 server_message_id。
 */
export async function updateMessageAttachmentInDb(
  messageId: string,
  uploadId: string,
  patch: RefreshedAttachmentPatch
): Promise<void> {
  if (!messageId || !uploadId) return;
  const db = getActiveMobileSQLiteConnection();
  if (!db) return;

  try {
    const rows = await queryRows<SQLiteRow>(
      db,
      `SELECT client_message_id, payload
         FROM mobile_messages
        WHERE client_message_id = ?
           OR (server_message_id IS NOT NULL AND server_message_id <> '' AND server_message_id = ?)
        LIMIT 1`,
      [messageId, messageId]
    );
    const row = rows[0];
    if (!row?.payload) return;
    const message = safeJsonParse<Message>(String(row.payload), null as never);
    if (!message) return;

    const changed = applyAttachmentPatchToContent(
      message.content,
      uploadId,
      patch
    );
    if (!changed) return;

    await db.executeAsync(
      `UPDATE mobile_messages
          SET payload = ?
        WHERE client_message_id = ?`,
      [JSON.stringify(message), String(row.client_message_id)]
    );
  } catch (err) {
    persistLog.warn("updateMessageAttachmentInDb failed", {
      messageId,
      uploadId,
      err: err instanceof Error ? err.message : String(err)
    });
  }
}

/**
 * 递归修改 content：
 *   - 文件型 content 且 upload_id 匹配 → 更新 url/thumb_url/preview_url/thumb_status
 *   - 文件型 content 且 thumbnail_upload_id 匹配 → 封面附件刷新，其原图 URL
 *     写回 content.thumb_url（视频封面即封面附件的 object_name）
 *   - 合并转发 → 递归每个 nested item.content
 * 返回是否发生过实际变化（用于跳过无意义 UPDATE）。
 */
function applyAttachmentPatchToContent(
  content: unknown,
  uploadId: string,
  patch: RefreshedAttachmentPatch
): boolean {
  if (!content || typeof content !== "object") return false;

  if (isFileMessageContent(content)) {
    const file = content as unknown as Record<string, unknown>;
    const isMain = String(file.upload_id || "") === uploadId;
    const isCover = String(file.thumbnail_upload_id || "") === uploadId;
    if (!isMain && !isCover) return false;

    let changed = false;
    if (isMain) {
      if (patch.url !== undefined && file.url !== patch.url) {
        file.url = patch.url;
        changed = true;
      }
      if (patch.thumb_url !== undefined && file.thumb_url !== patch.thumb_url) {
        file.thumb_url = patch.thumb_url;
        changed = true;
      }
      if (
        patch.preview_url !== undefined &&
        file.preview_url !== patch.preview_url
      ) {
        file.preview_url = patch.preview_url;
        changed = true;
      }
      if (
        patch.thumb_status !== undefined &&
        file.thumb_status !== patch.thumb_status
      ) {
        file.thumb_status = patch.thumb_status;
        changed = true;
      }
    } else {
      // 封面附件刷新：封面附件的原图 URL 即视频封面对应的 content.thumb_url。
      if (patch.url !== undefined && file.thumb_url !== patch.url) {
        file.thumb_url = patch.url;
        changed = true;
      }
    }
    return changed;
  }

  if (isMergedForwardContent(content)) {
    const merged = content as { messages?: Array<{ content?: unknown }> };
    if (!Array.isArray(merged.messages)) return false;
    let changed = false;
    for (const item of merged.messages) {
      if (!item) continue;
      if (applyAttachmentPatchToContent(item.content, uploadId, patch)) {
        changed = true;
      }
    }
    return changed;
  }

  return false;
}
