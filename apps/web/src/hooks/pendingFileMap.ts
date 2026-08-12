/**
 * 模块级内存映射：保存尚未成功上传完成的附件 File 句柄。
 *
 * 用于失败后从消息气泡的"重试"图标重新触发上传：
 * - key: client_message_id（与乐观消息一致）
 * - value: 用户原始选中的 File（已应用客户端压缩、若有）
 *
 * 进程刷新后丢失（与 WhatsApp / Telegram 行为一致）。被丢失时 UI 应提示
 * 用户重新选择文件发送。
 */
const pendingFileMap = new Map<string, File>();

export function setPendingUploadFile(
  clientMessageId: string,
  file: File
): void {
  pendingFileMap.set(clientMessageId, file);
}

export function getPendingUploadFile(
  clientMessageId: string
): File | undefined {
  return pendingFileMap.get(clientMessageId);
}

export function deletePendingUploadFile(clientMessageId: string): void {
  pendingFileMap.delete(clientMessageId);
}
