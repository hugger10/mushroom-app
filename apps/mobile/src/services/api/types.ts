import type { AttachmentCategory } from "@mushroom/shared";

export interface MobileAttachmentAsset {
  uri: string;
  name: string;
  type?: string;
  size?: number;
  /** 图片/视频原始宽（像素），如果调用方已知道则传入，便于服务端缩略图生成校验。 */
  width?: number;
  /** 图片/视频原始高（像素）。 */
  height?: number;
  /** 视频/音频时长（毫秒）。 */
  durationMs?: number;
  /** 显式指定附件分类；不传则由 mime / 扩展名推断。 */
  category?: AttachmentCategory;
}
