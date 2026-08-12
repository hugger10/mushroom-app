import { message } from "antd";
import type { SendFileMessage, VoiceFileOptions } from "./types";

/**
 * 触发附件上传发送。
 *
 * 失败处理已迁移至消息气泡（PendingAttachmentBubble + 重试图标）：
 * 此处仅在出错时弹一个 toast 提示，避免 Composer 卡片占位被群组消息打断，
 * 与 WhatsApp / Telegram / WeChat 行为对齐。
 *
 * 返回值：成功 true / 失败 false（用于 Composer 决定是否清空预览图）。
 */
export async function sendFileWithState(
  file: File,
  onSendFileMessage: SendFileMessage,
  options?: VoiceFileOptions
) {
  try {
    await onSendFileMessage(file, undefined, options);
    return true;
  } catch (error) {
    const nextError =
      error instanceof Error ? error.message : "File send failed";
    message.error(nextError);
    return false;
  }
}
