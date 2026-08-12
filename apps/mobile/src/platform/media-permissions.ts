import { Alert, Platform } from "react-native";
import { i18n } from "../i18n";
import {
  PERMISSIONS,
  RESULTS,
  check,
  openSettings,
  request,
  type Permission,
  type PermissionStatus,
  type Rationale
} from "react-native-permissions";

export type MediaPermissionKind =
  | "microphone"
  | "camera"
  | "photo-library-write";

export type MediaPermissionResolution = {
  granted: boolean;
  permission: Permission | null;
  status: PermissionStatus | "unavailable";
};

function resolvePermission(kind: MediaPermissionKind) {
  if (kind === "microphone") {
    return Platform.select({
      ios: PERMISSIONS.IOS.MICROPHONE,
      android: PERMISSIONS.ANDROID.RECORD_AUDIO
    });
  }
  if (kind === "camera") {
    return Platform.select({
      ios: PERMISSIONS.IOS.CAMERA,
      android: PERMISSIONS.ANDROID.CAMERA
    });
  }
  if (kind === "photo-library-write") {
    return Platform.select({
      ios: PERMISSIONS.IOS.PHOTO_LIBRARY_ADD_ONLY,
      android: PERMISSIONS.ANDROID.WRITE_EXTERNAL_STORAGE
    });
  }
  return null;
}

export function getPermissionLabel(kind: MediaPermissionKind) {
  if (kind === "microphone") return i18n.t("permissions.microphone");
  if (kind === "camera") return i18n.t("permissions.camera");
  return i18n.t("permissions.photoLibrary");
}

function getRequestRationale(kind: MediaPermissionKind): Rationale | undefined {
  if (Platform.OS !== "android") {
    return undefined;
  }

  const label = getPermissionLabel(kind);
  const actionMap: Record<MediaPermissionKind, string> = {
    microphone: i18n.t("permissions.actionMicrophone"),
    camera: i18n.t("permissions.actionCamera"),
    "photo-library-write": i18n.t("permissions.actionPhotoLibrary")
  };
  const action = actionMap[kind] ?? "";

  return {
    title: i18n.t("permissions.allowTitle", { label }),
    message: i18n.t("permissions.requestMessage", { label, action }),
    buttonPositive: i18n.t("permissions.allow"),
    buttonNegative: i18n.t("permissions.notNow")
  };
}

export function showPermissionBlockedAlert(kind: MediaPermissionKind) {
  const label = getPermissionLabel(kind);

  Alert.alert(
    i18n.t("permissions.blockedTitle", { label }),
    i18n.t("permissions.blockedMessage", { label }),
    [
      {
        text: i18n.t("common.cancel"),
        style: "cancel"
      },
      {
        text: i18n.t("permissions.openSettings"),
        onPress: () => {
          void openSettings().catch(() => undefined);
        }
      }
    ]
  );
}

export function showPermissionUnavailableAlert(kind: MediaPermissionKind) {
  const label = getPermissionLabel(kind);

  Alert.alert(
    i18n.t("permissions.unavailableTitle", { label }),
    i18n.t("permissions.unavailableMessage", { label })
  );
}

/**
 * 解析媒体权限：先检查现状，未授予再请求；遇到 BLOCKED/UNAVAILABLE 给出系统弹窗引导。
 * 传入 `{ silent: true }` 时跳过 BLOCKED/UNAVAILABLE 的引导弹窗（用于冷启动预申请）。
 * 返回结构与 react-native-permissions 一致，调用方可根据 status 判断后续行为。
 */
export async function resolveMediaPermission(
  kind: MediaPermissionKind,
  options?: { silent?: boolean }
): Promise<MediaPermissionResolution> {
  const permission = resolvePermission(kind);
  if (!permission) {
    return {
      granted: false,
      permission: null,
      status: "unavailable"
    };
  }

  const current = await check(permission);
  if (current === RESULTS.GRANTED || current === RESULTS.LIMITED) {
    return {
      granted: true,
      permission,
      status: current
    };
  }

  if (current === RESULTS.UNAVAILABLE) {
    if (!options?.silent) {
      showPermissionUnavailableAlert(kind);
    }
    return {
      granted: false,
      permission,
      status: current
    };
  }

  const requested = await request(permission, getRequestRationale(kind));
  if (requested === RESULTS.GRANTED || requested === RESULTS.LIMITED) {
    return {
      granted: true,
      permission,
      status: requested
    };
  }

  if (requested === RESULTS.BLOCKED) {
    if (!options?.silent) {
      showPermissionBlockedAlert(kind);
    }
  } else if (requested === RESULTS.UNAVAILABLE) {
    if (!options?.silent) {
      showPermissionUnavailableAlert(kind);
    }
  }

  return {
    granted: false,
    permission,
    status: requested
  };
}

export async function ensureCameraPermission(): Promise<MediaPermissionResolution> {
  return resolveMediaPermission("camera");
}

export async function ensureMicrophonePermission(): Promise<MediaPermissionResolution> {
  return resolveMediaPermission("microphone");
}

/**
 * 静默版麦克风权限预申请，供冷启动引导使用：在 BLOCKED/UNAVAILABLE 时不再弹
 * "打开设置"引导弹窗，避免打断首次启动体验；后续真实使用时仍走 ensureMicrophonePermission。
 */
export async function ensureMicrophonePermissionSilently(): Promise<MediaPermissionResolution> {
  return resolveMediaPermission("microphone", { silent: true });
}

export function getDeniedErrorMessage(kind: MediaPermissionKind, verb: string) {
  const label = getPermissionLabel(kind);
  return i18n.t("permissions.deniedMessage", { label, verb });
}

export function getUnavailableErrorMessage(
  kind: MediaPermissionKind,
  verb: string
) {
  const label = getPermissionLabel(kind);
  return i18n.t("permissions.unavailableWithVerb", { label, verb });
}

export function getBlockedErrorMessage(
  kind: MediaPermissionKind,
  verb: string
) {
  const label = getPermissionLabel(kind);
  return i18n.t("permissions.blockedWithVerb", { label, verb });
}

/**
 * 确保写入相册权限。
 *
 * Android 29+（API 29 / Android 10）开始，系统 MediaStore API 允许直接写入相册
 * 而不需要 `WRITE_EXTERNAL_STORAGE` 运行时权限；`CameraRoll.save()` 内部使用
 * MediaStore，因此 >= 29 时跳过权限请求。
 *
 * iOS 14+ 通过 `PHPhotoLibraryAddOnly` 请求"只写入"权限，不会读取已有相册内容，
 * 符合最小权限原则。
 */
export async function ensurePhotoLibraryWritePermission(): Promise<MediaPermissionResolution> {
  if (Platform.OS === "android" && (Platform.Version as number) >= 29) {
    return { granted: true, permission: null, status: RESULTS.GRANTED };
  }
  return resolveMediaPermission("photo-library-write");
}
