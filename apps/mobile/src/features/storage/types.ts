// Re-export shared 媒体自动下载类型，避免桌面/移动重复定义。
// `MediaCategory` / `MediaAutoDownloadPolicy` / `MediaAutoDownloadPreferences`
// / 默认值 / 常量集合统一来自 `@mushroom/shared`。
export {
  DEFAULT_MEDIA_AUTO_DOWNLOAD_PREFERENCES,
  MEDIA_AUTO_DOWNLOAD_POLICIES,
  MEDIA_CATEGORIES,
  type MediaAutoDownloadPolicy,
  type MediaAutoDownloadPreferences,
  type MediaCategory
} from "@mushroom/shared";
