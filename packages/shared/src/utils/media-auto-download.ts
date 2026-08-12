/**
 * 媒体自动下载策略 — 桌面 / 移动 / 共享真相源。
 *
 * 设计参考 WhatsApp / Telegram：
 * - 用户按媒体类别（图片 / 视频 / 语音 / 文档）分别配置策略
 * - 网络维度仅区分 Wi-Fi 与蜂窝；桌面端通常视为 wifi
 * - 自动下载额外受单文件大小阈值约束，用户主动点击不受限
 */

export type MediaCategory = "photos" | "audio" | "videos" | "documents";

export type MediaAutoDownloadPolicy = "none" | "wifi" | "wifiCellular";

/**
 * 网络环境抽象：
 * - wifi：当前为 Wi-Fi 或以太网（桌面端默认按 wifi 处理）
 * - cellular：移动数据网络
 * - other：已联网但既非 Wi-Fi 也非蜂窝（少见的未知类型）
 * - none：未联网或不可达
 */
export type NetworkType = "wifi" | "cellular" | "other" | "none";

export const MEDIA_CATEGORIES: MediaCategory[] = [
  "photos",
  "audio",
  "videos",
  "documents"
];

export const MEDIA_AUTO_DOWNLOAD_POLICIES: MediaAutoDownloadPolicy[] = [
  "none",
  "wifi",
  "wifiCellular"
];

export type MediaAutoDownloadPreferences = Record<
  MediaCategory,
  MediaAutoDownloadPolicy
>;

export const DEFAULT_MEDIA_AUTO_DOWNLOAD_PREFERENCES: MediaAutoDownloadPreferences =
  {
    // 推荐：照片走 Wi-Fi+蜂窝，其它仅 Wi-Fi（接近 WhatsApp 默认）
    photos: "wifiCellular",
    audio: "wifi",
    videos: "wifi",
    documents: "wifi"
  };

const UNLIMITED = Number.POSITIVE_INFINITY;
const NEVER = 0;
const MB = 1024 * 1024;

interface CategoryThresholds {
  wifi: number;
  cellular: number;
}

/**
 * 「媒体自动下载」内置大小阈值（单位：字节）。
 * 仅作用于「自动下载」路径，用户主动点击不受限。
 */
export const AUTO_DOWNLOAD_SIZE_LIMITS: Record<
  MediaCategory,
  CategoryThresholds
> = {
  photos: { wifi: UNLIMITED, cellular: 5 * MB },
  audio: { wifi: 5 * MB, cellular: 2 * MB },
  videos: { wifi: 30 * MB, cellular: NEVER },
  documents: { wifi: 20 * MB, cellular: NEVER }
};

/**
 * 取得指定类别在某网络环境下的字节阈值。
 * - 返回 0 表示「永不自动下载」
 * - 返回 +Infinity 表示「不限制大小」
 */
export function getAutoDownloadSizeLimit(
  category: MediaCategory,
  networkType: NetworkType
): number {
  const thresholds = AUTO_DOWNLOAD_SIZE_LIMITS[category];
  if (!thresholds) {
    return NEVER;
  }
  if (networkType === "wifi") {
    return thresholds.wifi;
  }
  if (networkType === "cellular") {
    return thresholds.cellular;
  }
  return NEVER;
}

export interface ShouldAutoDownloadInput {
  category: MediaCategory;
  policy: MediaAutoDownloadPolicy;
  /**
   * 当前网络类型。桌面端通常传 "wifi"。
   * 默认值：未传时按 "wifi" 处理（桌面默认即可，移动端必须显式传入）。
   */
  networkType?: NetworkType;
  /**
   * 文件大小（字节）。null/undefined 表示未知。
   */
  fileSizeBytes?: number | null;
}

/**
 * 决定一条媒体消息是否应被「自动下载」。
 *
 * 判定顺序：
 * 1. 策略为 none → 不下载
 * 2. 网络未知/未连接（none/other）→ 不下载
 * 3. 策略为 wifi 但当前为蜂窝 → 不下载
 * 4. size 未知：videos / documents 拒绝；photos / audio 通过
 * 5. size 已知且超过对应类别阈值 → 拒绝
 * 6. 否则通过
 */
export function shouldAutoDownload(input: ShouldAutoDownloadInput): boolean {
  const { category, policy, networkType = "wifi", fileSizeBytes } = input;

  if (policy === "none") {
    return false;
  }
  if (networkType === "none" || networkType === "other") {
    return false;
  }
  if (policy === "wifi" && networkType !== "wifi") {
    return false;
  }

  const sizeKnown =
    typeof fileSizeBytes === "number" &&
    Number.isFinite(fileSizeBytes) &&
    fileSizeBytes > 0;

  if (!sizeKnown) {
    return category === "photos" || category === "audio";
  }

  const limit = getAutoDownloadSizeLimit(category, networkType);
  if (limit <= 0) {
    return false;
  }
  return (fileSizeBytes as number) <= limit;
}

/**
 * 校验任意值是否合法的策略字面量（用于反序列化/IPC 入参）。
 */
export function isMediaAutoDownloadPolicy(
  value: unknown
): value is MediaAutoDownloadPolicy {
  return (
    typeof value === "string" &&
    (MEDIA_AUTO_DOWNLOAD_POLICIES as string[]).includes(value)
  );
}

/**
 * 校验任意值是否合法的类别字面量。
 */
export function isMediaCategory(value: unknown): value is MediaCategory {
  return (
    typeof value === "string" && (MEDIA_CATEGORIES as string[]).includes(value)
  );
}

/**
 * 把任意输入归一为完整的偏好对象（缺失项使用默认值，非法项忽略）。
 */
export function normalizeMediaAutoDownloadPreferences(
  input: unknown
): MediaAutoDownloadPreferences {
  const result: MediaAutoDownloadPreferences = {
    ...DEFAULT_MEDIA_AUTO_DOWNLOAD_PREFERENCES
  };
  if (!input || typeof input !== "object") {
    return result;
  }
  const partial = input as Partial<Record<MediaCategory, unknown>>;
  for (const category of MEDIA_CATEGORIES) {
    const candidate = partial[category];
    if (isMediaAutoDownloadPolicy(candidate)) {
      result[category] = candidate;
    }
  }
  return result;
}
