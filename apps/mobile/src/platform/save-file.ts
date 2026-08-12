import { Platform, Share } from "react-native";
import RNFS from "react-native-fs";
import { downloadMobileMediaCache } from "./media-cache";
import type { MobileMediaCacheInput } from "./media-cache";
import { i18n } from "../i18n";

export type SaveResult = { success: true } | { success: false; error: string };

/**
 * 将文件/音频附件保存到设备本地存储。
 *
 * Android → RNFS.DownloadDirectoryPath（公共下载目录）
 * iOS     → RNFS.DocumentDirectoryPath/Saved + Share.share 分享面板
 *
 * 流程：
 * 1. 通过 downloadMobileMediaCache 获取/缓存文件（自动处理 URL 自愈、去重）
 * 2. 复制到目标目录，冲突时自动加 (1) (2) 后缀
 * 3. iOS 弹出系统分享面板
 */
export async function saveFileToDevice(params: {
  url: string;
  fileName: string;
  username: string;
  apiBaseUrl: string;
  uploadId?: string | null;
  mimeType?: string | null;
  messageId?: string | null;
  fileSize?: number | null;
}): Promise<SaveResult> {
  const { fileName, apiBaseUrl, uploadId, mimeType, messageId, fileSize } =
    params;
  let url = params.url;

  // 补全相对路径。
  if (url.startsWith("/")) {
    url = `${apiBaseUrl}${url}`;
  }

  // 文件名兜底。
  const safeFileName =
    (fileName && fileName.trim()) ||
    i18n.t("fileSave.untitledFile", { timestamp: Date.now() });

  try {
    // 1. 通过媒体缓存层下载/获取文件。
    const cacheInput: MobileMediaCacheInput = {
      username: params.username,
      remoteUrl: url,
      category: "files",
      uploadId: uploadId ?? null,
      mimeType: mimeType ?? null,
      originalName: safeFileName,
      messageId: messageId ?? null,
      size: fileSize ?? null
    };

    const cacheRecord = await downloadMobileMediaCache(cacheInput, {
      auto: false
    });

    if (!cacheRecord?.localPath) {
      return { success: false, error: i18n.t("fileSave.downloadFailed") };
    }

    // 2. 确定目标目录。
    const destDir =
      Platform.OS === "android"
        ? RNFS.DownloadDirectoryPath
        : `${RNFS.DocumentDirectoryPath}/Saved`;

    await RNFS.mkdir(destDir).catch(() => {});

    // 3. 文件名冲突处理：同名时加 (n) 后缀。
    const dotIdx = safeFileName.lastIndexOf(".");
    const baseName = dotIdx > 0 ? safeFileName.slice(0, dotIdx) : safeFileName;
    const ext = dotIdx > 0 ? safeFileName.slice(dotIdx) : "";

    let destPath = `${destDir}/${safeFileName}`;
    let counter = 1;
    while (await RNFS.exists(destPath)) {
      destPath = `${destDir}/${baseName}(${counter})${ext}`;
      counter++;
    }

    // 4. 复制到目标位置。
    await RNFS.copyFile(cacheRecord.localPath, destPath);

    // 5. iOS：弹出系统分享面板（取消分享不影响保存结果）。
    if (Platform.OS === "ios") {
      try {
        await Share.share({ url: `file://${destPath}` });
      } catch {
        // 用户取消分享面板，文件已保存到 Saved/ 目录。
      }
    }

    return { success: true };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : i18n.t("fileSave.saveFailed");
    return { success: false, error: message };
  }
}
