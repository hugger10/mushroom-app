/**
 * 模块级内存映射：保存尚未成功上传完成的附件 asset 描述。
 *
 * 用于失败后从消息气泡的"重试"按钮重新触发上传：
 * - key: client_message_id（与乐观消息一致）
 * - value: 用户原始选中的 asset 描述（已应用客户端压缩 / 抽帧若有）
 *
 * 与桌面端 `apps/web/src/hooks/pendingFileMap.ts` 对称。RN 没有 File 对象，
 * 这里保留 `uri / name / type / size` 等元数据，重传时直接交给
 * `uploadMobileFile` 即可（RN-fetch-blob 支持 `file://` URI）。
 *
 * 进程重启后丢失（与 WhatsApp / Telegram 行为一致）。被丢失时 UI 应提示
 * 用户重新选择文件发送。
 */

export interface PendingMobileAsset {
  uri: string;
  name: string;
  type: string;
  size: number | undefined;
  width?: number;
  height?: number;
  durationMs?: number;
  category: "image" | "video" | "audio" | "voice" | "file";
  kind?: "voice_message";
  sendAsOriginal?: boolean;
  /** 视频附件的本地首帧缩略图描述（如果在乐观插入时已完成抽帧）。 */
  thumbnail?: {
    uri: string;
    name: string;
    type: string;
    size: number | undefined;
    width?: number;
    height?: number;
  };
  /** 视频时长（毫秒），便于重试时不丢失 duration_ms 字段。 */
  durationMsFromAsset?: number;
  /** 客户端压缩前的原始大小（仅图片压缩生效时记录）。 */
  originalSize?: number;
  /** 语音消息时长（秒）。 */
  durationSeconds?: number;
  /** 语音消息波形。 */
  waveform?: number[];
}

const pendingAssetMap = new Map<string, PendingMobileAsset>();

export function setPendingAsset(
  clientMessageId: string,
  asset: PendingMobileAsset
): void {
  pendingAssetMap.set(clientMessageId, asset);
}

export function getPendingAsset(
  clientMessageId: string
): PendingMobileAsset | undefined {
  return pendingAssetMap.get(clientMessageId);
}

export function deletePendingAsset(clientMessageId: string): void {
  pendingAssetMap.delete(clientMessageId);
}
