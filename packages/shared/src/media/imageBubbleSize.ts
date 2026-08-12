/**
 * 跨端共享：根据图片/视频附件的真实像素宽高，计算消息气泡内媒体元素
 * 应当渲染的目标尺寸，使气泡贴合真实图像区域，时间戳/已读 chip
 * 始终落在图像像素上而非 letterbox 留白上。
 *
 * 参考 WhatsApp / Telegram：气泡随图片形状变化；过小图（chip 放不下）
 * 退化为"时间戳在气泡下方"。
 */

export interface ImageBubbleSizeInput {
  width?: number | null;
  height?: number | null;
}

export interface ImageBubbleSizeOptions {
  /** 最小宽度（px）。默认 80。 */
  minWidth?: number;
  /** 最大宽度（px）。默认 280。Web 图片气泡历史值。 */
  maxWidth?: number;
  /** 最小高度（px）。默认 80。 */
  minHeight?: number;
  /** 最大高度（px）。默认 320。Web 图片气泡历史值。 */
  maxHeight?: number;
  /**
   * 计算得到的宽度小于此阈值时认为 overlay chip 放不下，
   * 应把时间戳渲染到气泡下方。默认 120px（chip + 8px padding 大约 100px）。
   */
  externalFooterMinWidth?: number;
  /**
   * 缺失尺寸时回退使用的宽高比 (width / height)。默认 4/3。
   */
  fallbackAspectRatio?: number;
}

export interface ImageBubbleSize {
  /** 实际渲染宽度（px，整数）。 */
  width: number;
  /** 实际渲染高度（px，整数）。 */
  height: number;
  /** 宽高比 width / height（已 clamp 后）。 */
  aspectRatio: number;
  /** 服务端是否提供了有效的 width/height。 */
  hasIntrinsic: boolean;
  /**
   * 是否需要把时间戳/已读 chip 渲染到气泡下方（而非叠加在图片上）。
   * true 表示图片本身太小，overlay 会盖住主要内容或溢出。
   */
  useExternalFooter: boolean;
}

const DEFAULT_OPTIONS: Required<ImageBubbleSizeOptions> = {
  minWidth: 80,
  maxWidth: 280,
  minHeight: 80,
  maxHeight: 320,
  externalFooterMinWidth: 120,
  fallbackAspectRatio: 4 / 3
};

/**
 * 根据附件元数据计算媒体气泡的目标显示尺寸。
 *
 * 算法：
 * 1. 若服务端给出有效 width/height，使用之；否则按 fallback 比例 + maxWidth
 *    构造一个占位框（hasIntrinsic=false，后续可在 onLoad 后重算）。
 * 2. 按比例先 clamp 到 [minWidth, maxWidth] × [minHeight, maxHeight]：
 *    - 若超宽，按 maxWidth 等比缩放；
 *    - 若结果超高，再按 maxHeight 等比缩放；
 *    - 若小于 min*，按比例放大到至少满足较短边的下限，但同时尊重上限。
 * 3. 计算 useExternalFooter：当最终宽度 < externalFooterMinWidth 时为 true。
 */
export function computeImageBubbleSize(
  input: ImageBubbleSizeInput | null | undefined,
  options: ImageBubbleSizeOptions = {}
): ImageBubbleSize {
  const opt = { ...DEFAULT_OPTIONS, ...options };
  const rawW = Number(input?.width);
  const rawH = Number(input?.height);
  const hasIntrinsic =
    Number.isFinite(rawW) && Number.isFinite(rawH) && rawW > 0 && rawH > 0;

  let ratio = hasIntrinsic ? rawW / rawH : opt.fallbackAspectRatio;
  if (!Number.isFinite(ratio) || ratio <= 0) {
    ratio = opt.fallbackAspectRatio;
  }

  // 起始尺寸：以 maxWidth 为基准
  let width = opt.maxWidth;
  let height = width / ratio;

  // 超高 → 按 maxHeight 收
  if (height > opt.maxHeight) {
    height = opt.maxHeight;
    width = height * ratio;
  }

  // 若服务端给的真实图就很小，不放大到最大宽，按真实像素 clamp
  if (hasIntrinsic && rawW < opt.maxWidth && rawH < opt.maxHeight) {
    width = rawW;
    height = rawH;
  }

  // 现在保证 ≤ max；再处理 < min（按比例放大，但不能超过 max）
  if (width < opt.minWidth) {
    const scale = opt.minWidth / width;
    width = opt.minWidth;
    height = height * scale;
    if (height > opt.maxHeight) {
      const back = opt.maxHeight / height;
      height = opt.maxHeight;
      width = width * back;
    }
  }
  if (height < opt.minHeight) {
    const scale = opt.minHeight / height;
    height = opt.minHeight;
    width = width * scale;
    if (width > opt.maxWidth) {
      const back = opt.maxWidth / width;
      width = opt.maxWidth;
      height = height * back;
    }
  }

  const finalWidth = Math.round(width);
  const finalHeight = Math.round(height);
  const finalRatio = finalHeight > 0 ? finalWidth / finalHeight : ratio;

  return {
    width: finalWidth,
    height: finalHeight,
    aspectRatio: finalRatio,
    hasIntrinsic,
    useExternalFooter: finalWidth < opt.externalFooterMinWidth
  };
}

/**
 * 兼容旧 API：返回 CSS aspect-ratio 字符串（如 "1.5"），缺失时回退。
 * 仅用于过渡期的视频气泡或其他尚未切换到 computeImageBubbleSize 的位置。
 */
export function getMediaAspectRatio(
  content: ImageBubbleSizeInput | null | undefined,
  fallback: string = "4 / 3"
): string {
  const w = Number(content?.width);
  const h = Number(content?.height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    return fallback;
  }
  const ratio = w / h;
  // 与历史实现一致：clamp 到 [0.5, 2.0]
  const clamped = Math.min(2.0, Math.max(0.5, ratio));
  return String(clamped);
}
