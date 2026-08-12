import { Platform } from "react-native";
import { CameraRoll } from "@react-native-camera-roll/camera-roll";
import RNFS from "react-native-fs";
import { ensurePhotoLibraryWritePermission } from "./media-permissions";
import { i18n } from "../i18n";

export type SaveResult = { success: true } | { success: false; error: string };

function isRemoteUrl(uri: string): boolean {
  return uri.startsWith("http://") || uri.startsWith("https://");
}

/**
 * 将图片或视频保存到系统相册。
 *
 * CameraRoll.save() 在 Android 上只支持 file:// 或 content:// URI，
 * 对于远程 http(s) URL 需要先下载到临时文件再保存。
 *
 * 流程：
 * 1. 检查/请求写入相册权限（Android < 29 或 iOS 需要运行时权限）。
 * 2. 远程 URL → RNFS.downloadFile 下载到临时目录。
 * 3. 调用 CameraRoll.save(localPath) 写入系统相册。
 * 4. 清理临时文件。
 */
export async function saveToAlbum(uri: string): Promise<SaveResult> {
  const perm = await ensurePhotoLibraryWritePermission();
  if (!perm.granted) {
    return {
      success: false,
      error: i18n.t("fileSave.albumPermissionRequired")
    };
  }

  let localUri = uri;
  let tempFilePath: string | null = null;

  // Android CameraRoll.save 对远程 URL 支持不稳定，先下载到临时文件。
  if (Platform.OS === "android" && isRemoteUrl(uri)) {
    const ext = uri.includes(".mp4") ? ".mp4" : ".jpg";
    const dest = `${RNFS.CachesDirectoryPath}/save_to_album_${Date.now()}${ext}`;
    tempFilePath = dest;
    try {
      const downloadResult = await RNFS.downloadFile({
        fromUrl: uri,
        toFile: dest
      }).promise;
      if (downloadResult.statusCode !== 200) {
        return {
          success: false,
          error: i18n.t("fileSave.downloadFailedHttp", {
            code: downloadResult.statusCode
          })
        };
      }
      localUri = `file://${dest}`;
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : i18n.t("fileSave.downloadImageFailed");
      return { success: false, error: message };
    }
  }

  try {
    await CameraRoll.save(localUri, { type: "auto" });
    if (tempFilePath) {
      RNFS.unlink(tempFilePath).catch(() => undefined);
    }
    return { success: true };
  } catch (err) {
    if (tempFilePath) {
      RNFS.unlink(tempFilePath).catch(() => undefined);
    }
    const message =
      err instanceof Error ? err.message : i18n.t("fileSave.saveToAlbumFailed");
    return { success: false, error: message };
  }
}
