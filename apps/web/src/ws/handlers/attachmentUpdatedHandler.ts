import log from "@/utils/log";
import type { AttachmentUpdatedMessage } from "@mushroom/shared";

/**
 * 处理服务端推送的附件更新（图片缩略图 / 预览图异步生成完成）。
 * 通过 `upload_id` 在本地数据库中定位消息并合并字段，随后由
 * `db:message-updated` 事件触发渲染层刷新。
 */
export async function handleAttachmentUpdatedMessage(
  message: AttachmentUpdatedMessage
) {
  if (!message.upload_id) {
    log.warn("attachment_updated 缺少 upload_id", message);
    return;
  }
  try {
    await window.electronAPI.updateMessageAttachment({
      upload_id: message.upload_id,
      thumb_url: message.thumb_url,
      preview_url: message.preview_url,
      width: message.width,
      height: message.height,
      thumb_status: message.thumb_status
    });
  } catch (error) {
    log.error("应用 attachment_updated 失败", error);
  }
}
