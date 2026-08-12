/**
 * 铃声系统统一入口：选项解析、选中、试听、启动时回退校验。
 *
 * 平台差异：
 *   - iOS：原生 `AlertToneManager` 拷贝固定文件 + NSE 共享状态；系统铃声来自原生清单。
 *   - Android：原生 `MushroomRingtone` 系统选择器；内置音 raw 资源；渠道由
 *     `ensureNotificationChannels` 按偏好版本化重建。
 */

import { Platform } from "react-native";
import type { TFunction } from "i18next";
import {
  readNotificationPreferences,
  updateNotificationPreferences
} from "../notification-preferences";
import {
  ensureNotificationChannels,
  resetNotificationChannels
} from "../notifications/channels";
import {
  applyIosTone,
  checkIosToneFile,
  getIosSystemTones,
  previewIosTone
} from "./tone-bridge.ios";
import {
  launchAndroidSystemPicker,
  previewAndroidTone
} from "./tone-bridge.android";
import {
  deriveIosCurrentAlertFile,
  isContentUriSound,
  isSystemToneSound,
  type MessageSound
} from "./types";

export const SYSTEM_DEFAULT_OPTION = "__system_default__";

export type TonePickerOption = {
  value: string;
  label: string;
};

/** 选项 value → MessageSound。 */
export function optionValueToMessageSound(value: string): MessageSound {
  if (value === SYSTEM_DEFAULT_OPTION) {
    return null;
  }
  return value as MessageSound;
}

/** 铃声偏好 → 设置行右侧显示名。 */
export function getMessageSoundDisplayName(
  sound: MessageSound,
  customLabel: string | undefined,
  t: TFunction
): string {
  if (sound === null) {
    return t("me.notificationsPage.sound.default");
  }
  if (sound === "silent") {
    return t("me.notificationsPage.sound.silent");
  }
  if (sound === "message") {
    return t("me.notificationsPage.sound.toneMessage");
  }
  if (sound === "fade") {
    return t("me.notificationsPage.sound.toneFade");
  }
  if (isSystemToneSound(sound)) {
    return sound.slice("system:".length);
  }
  if (isContentUriSound(sound)) {
    return customLabel || t("me.notificationsPage.sound.customFallback");
  }
  return t("me.notificationsPage.sound.default");
}

/**
 * 铃声 Sheet 选项：
 *   - fixed：系统默认 / 静音 / 内置 两个；
 *   - system：iOS 追加原生返回的可用系统铃声；Android 为空（由「选择系统铃声…」
 *     入口拉起系统选择器，`supportsSystemPicker` 为 true）。
 */
export async function resolveToneOptions(t: TFunction): Promise<{
  fixed: TonePickerOption[];
  system: TonePickerOption[];
  supportsSystemPicker: boolean;
}> {
  const fixed: TonePickerOption[] = [
    {
      value: SYSTEM_DEFAULT_OPTION,
      label: t("me.notificationsPage.sound.default")
    },
    { value: "silent", label: t("me.notificationsPage.sound.silent") },
    { value: "message", label: t("me.notificationsPage.sound.toneMessage") },
    { value: "fade", label: t("me.notificationsPage.sound.toneFade") }
  ];

  if (Platform.OS === "ios") {
    const names = await getIosSystemTones();
    return {
      fixed,
      system: names.map(name => ({ value: `system:${name}`, label: name })),
      supportsSystemPicker: false
    };
  }

  return { fixed, system: [], supportsSystemPicker: true };
}

/** 选中并持久化铃声；iOS 拷贝 + 写 NSE 状态，Android 重建版本化渠道。 */
export async function selectTone(sound: MessageSound, label?: string) {
  updateNotificationPreferences({
    messageSound: sound,
    messageSoundLabel: label
  });

  if (Platform.OS === "ios") {
    await applyIosTone(sound);
  } else {
    resetNotificationChannels();
    await ensureNotificationChannels();
  }
}

/** 试听一个铃声。 */
export async function previewTone(sound: MessageSound) {
  if (Platform.OS === "ios") {
    await previewIosTone(sound);
  } else {
    await previewAndroidTone(sound);
  }
}

/** Android：拉起系统选择器并返回结果（取消 → null）。 */
export async function pickAndroidSystemTone() {
  const { messageSound } = readNotificationPreferences();
  const existingUri =
    typeof messageSound === "string" && messageSound.startsWith("content://")
      ? messageSound
      : null;
  return launchAndroidSystemPicker(existingUri);
}

/**
 * iOS 启动时回退校验：卸载重装后沙盒固定文件可能已丢失，
 * 此时把偏好回退为系统默认并同步 NSE 状态。
 */
export async function runIosToneFallbackCheck() {
  if (Platform.OS !== "ios") {
    return;
  }
  const { messageSound } = readNotificationPreferences();
  if (!deriveIosCurrentAlertFile(messageSound)) {
    return;
  }
  const exists = await checkIosToneFile(messageSound);
  if (!exists) {
    updateNotificationPreferences({ messageSound: null });
    await applyIosTone(null);
  }
}
