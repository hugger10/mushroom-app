/**
 * 图片压缩共享契约
 *
 * 该模块只提供配置常量、类型契约和决策逻辑，不包含任何浏览器或 React Native
 * 平台相关的实现，避免把 canvas / RN 依赖污染 shared 包。
 *
 * 具体像素操作在各端实现：
 * - apps/web/src/media/compressImage.ts （canvas / OffscreenCanvas / heic2any）
 * - apps/mobile/src/media/compressImage.ts （react-native-compressor）
 */

export interface ImageCompressOptions {
  /** 长边像素上限 */
  maxEdge: number;
  /** JPEG 输出质量 (0~1) */
  quality: number;
  /** JPEG MIME，固定 image/jpeg；保留字段以便未来扩展 webp */
  jpegMime: "image/jpeg";
  /** 是否剥离 EXIF（保留 Orientation 已在压缩时消化） */
  stripExif: boolean;
}

/**
 * 保守档位：长边 ≤ 2560，JPEG q85，强制剥 EXIF。
 *
 * 与主流 IM (WhatsApp HD / 微信原图关闭) 接近；
 * 在视觉无损的前提下显著减小相机原片 (4000x3000, 5~15MB) 的体积。
 */
export const DEFAULT_IMAGE_COMPRESS: ImageCompressOptions = {
  maxEdge: 2560,
  quality: 0.85,
  jpegMime: "image/jpeg",
  stripExif: true
};

/**
 * Outbox 占位缩略图档位：长边 ≤ 512，JPEG q70，强制剥 EXIF。
 *
 * 用途：消息气泡在 ACK 之前展示的本地预览（apps/web 的 IndexedDB /
 * Electron 主进程 outbox / mobile RNFS outbox 都用这一档）。目标是把
 * 4000×3000 的相机原片压到 < 50KB，避免：
 * - 浏览器渲染线程因 decode 巨图卡顿；
 * - IndexedDB / outbox 目录被原图撑爆（IDB 上限 500MB + LRU）；
 * - mobile 端在弱网下加载本地预览阻塞 UI。
 *
 * 与 `DEFAULT_IMAGE_COMPRESS` 的区别：
 * - `DEFAULT_*` 给"上传给对端"用，质量优先；
 * - `THUMBNAIL_*` 给"本地占位"用，体积优先。
 *
 * 仅用于占位预览；正式上传依旧走 `DEFAULT_IMAGE_COMPRESS` 重编码。
 */
export const THUMBNAIL_IMAGE_COMPRESS: ImageCompressOptions = {
  maxEdge: 512,
  quality: 0.7,
  jpegMime: "image/jpeg",
  stripExif: true
};

/** 压缩结果的元信息，写入消息 content 与日志 */
export interface CompressedImageMeta {
  width: number;
  height: number;
  originalWidth?: number;
  originalHeight?: number;
  originalSize: number;
  compressedSize: number;
  /** 实际输出 MIME（PNG 透明分支会保留 image/png） */
  mimeType: string;
  /** 是否真正改变了字节内容；为 false 表示直接返回原文件 */
  didCompress: boolean;
}

/** 压缩决策的输入 */
export interface CompressDecisionInput {
  /** 文件 MIME，若未知传空串 */
  mime: string;
  /** 文件字节数，未知传 0 */
  size: number;
}

export type CompressStrategy =
  /** 强制走 JPEG 重编码（HEIC/HEIF 必须；普通 JPEG 也走，目的是剥 EXIF + resize） */
  | "jpeg"
  /** 输出 PNG（含透明，仅 resize 不转 JPEG，避免黑底） */
  | "png"
  /** 跳过，直接上传原字节 */
  | "skip";

const HEIC_MIMES = new Set([
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence"
]);
const PNG_MIMES = new Set(["image/png", "image/x-png"]);
const JPEG_MIMES = new Set(["image/jpeg", "image/jpg", "image/pjpeg"]);
const WEBP_MIMES = new Set(["image/webp"]);

/** 文件最小阈值：小于该值且 MIME 已经是 JPEG 时，仍然走 JPEG 重编码以剥 EXIF。
 *  这里不作为"跳过压缩"的依据，仅供调用方参考。 */
export const TINY_IMAGE_BYTES = 16 * 1024;

/**
 * 决策：根据 MIME 选择压缩策略。
 *
 * - HEIC/HEIF: 必转 JPEG（兼容性 + 体积）
 * - PNG: 走 PNG 分支（保留透明，仅 resize）
 * - JPEG/WebP: JPEG 重编码 (resize + 剥 EXIF)
 * - 未知 / 不支持: skip（避免破坏）
 */
export function decideCompressStrategy(
  input: CompressDecisionInput
): CompressStrategy {
  const mime = (input.mime || "").toLowerCase();
  if (HEIC_MIMES.has(mime)) return "jpeg";
  if (PNG_MIMES.has(mime)) return "png";
  if (JPEG_MIMES.has(mime) || WEBP_MIMES.has(mime)) return "jpeg";
  // GIF: 跳过以保留动画
  if (mime === "image/gif") return "skip";
  // 兜底：未知图片类型不动
  return "skip";
}

/** 是否应当尝试压缩；仅 strategy !== "skip" 时为 true。 */
export function shouldCompressImage(input: CompressDecisionInput): boolean {
  return decideCompressStrategy(input) !== "skip";
}

/** 把 HEIC 文件名替换为 .jpg 扩展名 */
export function rewriteHeicFilenameToJpg(name: string): string {
  return name.replace(/\.(heic|heif)$/i, ".jpg");
}
