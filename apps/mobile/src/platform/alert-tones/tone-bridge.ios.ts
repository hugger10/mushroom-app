/**
 * iOS 平台桥：调 `AlertToneManager` 原生模块。
 *
 * 注意：App Group 内 `NotificationToneState.json` 的写入由原生 `setTone` 完成，
 * JS 侧不直接碰 App Group（react-native-fs 无法访问 App Group 容器）。
 */

import { NativeModules, Platform } from "react-native";
import { LibraryDirectoryPath } from "react-native-fs";
import { mobileVoiceRecorder } from "../voice-recorder";
import {
  IOS_CURRENT_ALERT_CAF,
  IOS_CURRENT_ALERT_WAV,
  deriveIosCurrentAlertFile,
  isSystemToneSound,
  type MessageSound
} from "./types";

type AlertToneManagerNative = {
  getSystemTones: () => Promise<string[]>;
  setTone: (source: string, filename: string, state: string) => Promise<void>;
  checkToneFile: (filename: string) => Promise<boolean>;
};

const iosToneBridge = (
  Platform.OS === "ios" ? NativeModules.AlertToneManager : undefined
) as AlertToneManagerNative | undefined;

/** 本设备可用的 iOS 系统铃声名（模拟器上为空）。 */
export async function getIosSystemTones() {
  if (!iosToneBridge?.getSystemTones) {
    return [] as string[];
  }
  try {
    return await iosToneBridge.getSystemTones();
  } catch {
    return [] as string[];
  }
}

/** 把一个铃声偏好展开成原生 `setTone` 的参数。 */
export function iosToneParams(sound: MessageSound): {
  source: string;
  filename: string;
  state: string;
} {
  if (sound === null) {
    return { source: "", filename: "", state: "default" };
  }
  if (sound === "silent") {
    return { source: "", filename: "", state: "silent" };
  }
  if (sound === "message" || sound === "fade") {
    return {
      source: sound,
      filename: IOS_CURRENT_ALERT_WAV,
      state: IOS_CURRENT_ALERT_WAV
    };
  }
  if (isSystemToneSound(sound)) {
    return {
      source: sound,
      filename: IOS_CURRENT_ALERT_CAF,
      state: IOS_CURRENT_ALERT_CAF
    };
  }
  // content://（Android 专属）在 iOS 上无意义，回落系统默认。
  return { source: "", filename: "", state: "default" };
}

/** 拷贝固定文件 + 原生层写 NSE 共享状态。 */
export async function applyIosTone(sound: MessageSound) {
  if (!iosToneBridge?.setTone) {
    return;
  }
  const { source, filename, state } = iosToneParams(sound);
  await iosToneBridge.setTone(source, filename, state);
}

/** 沙盒固定文件是否存在（用于卸载重装后的回退校验）。 */
export async function checkIosToneFile(sound: MessageSound) {
  const filename = deriveIosCurrentAlertFile(sound);
  if (!filename) {
    return true;
  }
  if (!iosToneBridge?.checkToneFile) {
    return true;
  }
  try {
    return await iosToneBridge.checkToneFile(filename);
  } catch {
    return true;
  }
}

/** 试听：先确保固定文件就位，再播放沙盒文件。 */
export async function previewIosTone(sound: MessageSound) {
  await applyIosTone(sound);
  const filename = deriveIosCurrentAlertFile(sound);
  if (!filename) {
    return;
  }
  try {
    await mobileVoiceRecorder.stopPlayer();
  } catch {
    // ignore
  }
  await mobileVoiceRecorder.startPlayer(
    `file://${LibraryDirectoryPath}/Sounds/${filename}`
  );
}
