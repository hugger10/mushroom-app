import {
  errorCodes,
  isErrorWithCode,
  keepLocalCopy,
  pick,
  types
} from "@react-native-documents/picker";
import { launchCamera, launchImageLibrary } from "react-native-image-picker";
import { Alert } from "react-native";
import { RESULTS } from "react-native-permissions";
import {
  ensureCameraPermission,
  getBlockedErrorMessage,
  getUnavailableErrorMessage,
  type MediaPermissionResolution
} from "./media-permissions";
import { i18n } from "../i18n";

function chooseAvatarSource() {
  return new Promise<"library" | "camera" | null>(resolve => {
    Alert.alert(
      i18n.t("cameraPickers.editPhoto"),
      i18n.t("cameraPickers.chooseAvatarSource"),
      [
        {
          text: i18n.t("common.cancel"),
          style: "cancel",
          onPress: () => resolve(null)
        },
        {
          text: i18n.t("cameraPickers.takePhoto"),
          onPress: () => resolve("camera")
        },
        {
          text: i18n.t("cameraPickers.photoLibrary"),
          onPress: () => resolve("library")
        }
      ]
    );
  });
}

/**
 * 把媒体权限解析结果统一映射为：
 * - granted: 继续
 * - cancelled: 用户在系统授权弹窗里点了"拒绝"或"暂不"，调用方按取消处理（return null）
 * - 其余情况：抛出可读错误，便于上层 setError
 */
function applyCameraResolution(
  result: MediaPermissionResolution,
  verb: string
): "granted" | "cancelled" {
  if (result.granted) {
    return "granted";
  }
  // permission 字段为 null 说明当前平台没有可识别的权限项 → 视为不可用
  if (!result.permission || result.status === "unavailable") {
    throw new Error(getUnavailableErrorMessage("camera", verb));
  }
  if (result.status === RESULTS.BLOCKED) {
    throw new Error(getBlockedErrorMessage("camera", verb));
  }
  // DENIED：用户主动拒绝 → 等同于取消
  return "cancelled";
}

export type PickedMediaSource = "gallery" | "camera" | "quick-video";

export type PickedMediaAsset = {
  uri: string;
  name: string;
  type: string;
  size: number | undefined;
  width?: number;
  height?: number;
  durationMs?: number;
  /** 媒体来源：决定发送时是否需要自动保存到相册。 */
  source?: PickedMediaSource;
};

function normalizeMediaResult(
  result: Awaited<ReturnType<typeof launchImageLibrary>>,
  source: PickedMediaSource
): PickedMediaAsset | null {
  if (result.didCancel) {
    return null;
  }
  if (result.errorCode) {
    throw new Error(
      result.errorMessage || i18n.t("cameraPickers.selectMediaFailed")
    );
  }

  const asset = result.assets?.[0];
  if (!asset?.uri) {
    throw new Error(i18n.t("cameraPickers.noMediaFile"));
  }

  return {
    uri: asset.uri,
    name:
      asset.fileName ||
      `media-${Date.now()}${asset.type?.startsWith("video/") ? ".mp4" : ".jpg"}`,
    type: asset.type || "application/octet-stream",
    size: asset.fileSize ?? undefined,
    width: typeof asset.width === "number" ? asset.width : undefined,
    height: typeof asset.height === "number" ? asset.height : undefined,
    durationMs:
      typeof asset.duration === "number"
        ? Math.round(asset.duration * 1000)
        : undefined,
    source
  };
}

/**
 * 从相册选择图片或视频。直接打开系统相册，不再弹中间选项框，
 * 对齐微信/Telegram 在「附件 → 相册」入口的体验。
 */
export async function pickFromGallery(): Promise<PickedMediaAsset | null> {
  const result = await launchImageLibrary({
    mediaType: "mixed",
    selectionLimit: 1
  });
  return normalizeMediaResult(result, "gallery");
}

/**
 * 从相机直接拍照。对齐微信「附件 → 相机」直开后置相机拍照的行为。
 */
export async function pickFromCamera(): Promise<PickedMediaAsset | null> {
  const cameraOutcome = applyCameraResolution(
    await ensureCameraPermission(),
    i18n.t("cameraPickers.verbTakePhoto")
  );
  if (cameraOutcome === "cancelled") {
    return null;
  }
  const result = await launchCamera({
    mediaType: "mixed",
    cameraType: "back",
    saveToPhotos: false
  });
  return normalizeMediaResult(result, "camera");
}

export async function pickAvatarImage() {
  const source = await chooseAvatarSource();
  if (!source) {
    return null;
  }

  if (source === "camera") {
    const cameraOutcome = applyCameraResolution(
      await ensureCameraPermission(),
      i18n.t("cameraPickers.verbTakePhoto")
    );
    if (cameraOutcome === "cancelled") {
      return null;
    }
  }

  const result =
    source === "library"
      ? await launchImageLibrary({
          mediaType: "photo",
          selectionLimit: 1
        })
      : await launchCamera({
          mediaType: "mixed",
          cameraType: "front",
          saveToPhotos: false
        });

  if (result.didCancel) {
    return null;
  }
  if (result.errorCode) {
    throw new Error(
      result.errorMessage || i18n.t("cameraPickers.selectAvatarFailed")
    );
  }

  const asset = result.assets?.[0];
  if (!asset?.uri) {
    throw new Error(i18n.t("cameraPickers.noAvatarFile"));
  }

  return {
    uri: asset.uri,
    name: asset.fileName || `avatar-${Date.now()}.jpg`,
    type: asset.type || "image/jpeg",
    size: asset.fileSize ?? undefined
  };
}

export async function pickFileAttachment() {
  try {
    const [asset] = await pick({
      type: [types.allFiles]
    });

    let uploadUri = asset.uri;
    try {
      const localCopies = await keepLocalCopy({
        destination: "cachesDirectory",
        files: [
          {
            uri: asset.uri,
            fileName: asset.name || `file-${Date.now()}`,
            convertVirtualFileToType:
              asset.isVirtual && asset.convertibleToMimeTypes?.[0]?.mimeType
                ? asset.convertibleToMimeTypes[0].mimeType
                : undefined
          }
        ]
      });
      if (localCopies[0]?.status === "success" && localCopies[0].localUri) {
        uploadUri = localCopies[0].localUri;
      }
    } catch {
      // Fall back to the original picker URI if a local copy cannot be created.
    }

    return {
      uri: uploadUri,
      name: asset.name || `file-${Date.now()}`,
      type: asset.type || "application/octet-stream",
      size: asset.size ?? undefined
    };
  } catch (error) {
    if (
      isErrorWithCode(error) &&
      error.code === errorCodes.OPERATION_CANCELED
    ) {
      return null;
    }
    throw error;
  }
}
