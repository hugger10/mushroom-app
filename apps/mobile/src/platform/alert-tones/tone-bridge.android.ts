/**
 * Android 平台桥：调 `MushroomRingtone` 原生系统选择器。
 * 渠道重建由 JS（`ensureNotificationChannels`）完成，原生只做 Picker。
 */

import { NativeModules, Platform } from "react-native";
import { mobileVoiceRecorder } from "../voice-recorder";
import { BUILTIN_TONES, type BuiltinToneId } from "./builtin-tones";
import type { MessageSound } from "./types";

export type AndroidRingtoneSelection = {
  /** cancel | silent | system_default | custom（见原生模块注释） */
  selection: "cancel" | "silent" | "system_default" | "custom";
  uri: string | null;
  title: string | null;
};

type MushroomRingtoneNative = {
  launchMessageSoundPicker: (
    existingUri: string | null
  ) => Promise<AndroidRingtoneSelection>;
};

const androidRingtoneBridge = (
  Platform.OS === "android" ? NativeModules.MushroomRingtone : undefined
) as MushroomRingtoneNative | undefined;

/** 拉起系统铃声选择器。选择器内自带逐个试听。 */
export async function launchAndroidSystemPicker(
  existingUri: string | null
): Promise<AndroidRingtoneSelection> {
  if (!androidRingtoneBridge?.launchMessageSoundPicker) {
    throw new Error("MushroomRingtone 原生模块未注册");
  }
  return androidRingtoneBridge.launchMessageSoundPicker(existingUri);
}

const ANDROID_RESOURCE_PACKAGE = "com.outland.mushroom";

/** 试听 App 内置铃声（raw 资源）。 */
export async function previewAndroidBuiltinTone(toneId: BuiltinToneId) {
  const rawName = BUILTIN_TONES[toneId].android;
  try {
    await mobileVoiceRecorder.stopPlayer();
  } catch {
    // ignore
  }
  await mobileVoiceRecorder.startPlayer(
    `android.resource://${ANDROID_RESOURCE_PACKAGE}/raw/${rawName}`
  );
}

/** 试听内置/系统默认/自定义 URI。系统选择器自带的试听不在本路径。 */
export async function previewAndroidTone(sound: MessageSound) {
  if (sound === "message" || sound === "fade") {
    await previewAndroidBuiltinTone(sound);
  } else if (typeof sound === "string" && sound.startsWith("content://")) {
    try {
      await mobileVoiceRecorder.stopPlayer();
    } catch {
      // ignore
    }
    await mobileVoiceRecorder.startPlayer(sound);
  }
}
