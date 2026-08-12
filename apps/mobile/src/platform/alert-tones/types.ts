/**
 * Message-sound preference model + pure derivation helpers.
 *
 * This module is intentionally free of React Native / storage imports so the
 * normalization and channel-id / iOS-sound derivation logic can be unit-tested
 * with `node --test` (Node TypeScript stripping), mirroring
 * `test/notification-policy.test.mjs`.
 *
 * 取值语义（与 Android NotificationSound sealed interface 心智一致）：
 *   - `null`            系统默认（跟随系统）
 *   - `"silent"`        静音
 *   - `"message"`       App 内置 Mesh 音
 *   - `"fade"`          App 内置 Fade 音
 *   - `"system:<名>"`   iOS 系统铃声（名称在原生层维护）
 *   - `"content://..."` Android 系统选择器返回的自定义铃声 URI
 *
 * 类型上简化为 `string | null`（保证字面量收窄可用），合法性由
 * `normalizeMessageSound` 在运行时把关。
 */
export type MessageSound = string | null;

/** iOS 固定拷贝文件名（内置 wav / 系统 caf），对齐 element-x-ios currentAlert.caf。 */
export const IOS_CURRENT_ALERT_WAV = "currentAlert.wav";
export const IOS_CURRENT_ALERT_CAF = "currentAlert.caf";

/** Android 消息渠道 id 前缀，配合铃声偏好 hash 派生版本化渠道。 */
export const MESSAGES_CHANNEL_ID_PREFIX = "mushroom-messages";

export function isContentUriSound(value: MessageSound): boolean {
  return typeof value === "string" && value.startsWith("content://");
}

export function isBuiltinSound(value: MessageSound): boolean {
  return value === "message" || value === "fade";
}

export function isSystemToneSound(value: MessageSound): boolean {
  return typeof value === "string" && value.startsWith("system:");
}

export function normalizeMessageSound(value: unknown): MessageSound {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value !== "string") {
    return null;
  }
  if (
    value === "silent" ||
    value === "message" ||
    value === "fade" ||
    value.startsWith("system:") ||
    value.startsWith("content://")
  ) {
    return value;
  }
  return null;
}

/**
 * 仅当 `messageSound` 为 Android `content://` URI 时保留标签；其余情况一律清除，
 * 避免从自定义铃声切回内置/系统音后残留过期标题。
 */
export function normalizeMessageSoundLabel(
  sound: MessageSound,
  value: unknown
): string | undefined {
  if (!isContentUriSound(sound)) {
    return undefined;
  }
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * 稳定的短哈希（FNV-1a 32 位 → 8 位十六进制）。
 *
 * RN JS 运行时不提供内置 md5，为避免为渠道 id 派生引入第三方依赖，采用零依赖、
 * 确定性、对少量取值空间碰撞风险可忽略的 FNV-1a。渠道 id 只要求“声音变化即产生
 * 新渠道”且跨启动稳定，无密码学需求。
 */
export function shortHash(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** 按消息铃声偏好派生 Android 渠道 id。声音变化即产生新渠道。 */
export function getMessagesChannelId(sound: MessageSound): string {
  return `${MESSAGES_CHANNEL_ID_PREFIX}-${shortHash(sound ?? "default")}`;
}

/**
 * iOS 固定拷贝文件在 JS 侧的推导：
 *   - 内置音 → `currentAlert.wav`
 *   - 系统音 → `currentAlert.caf`（iOS UISounds 均为 caf）
 *   - 其余（null / silent / content URI）→ null
 * 原生 `setTone` 按相同文件名落盘，保证前后台引用一致。
 */
export function deriveIosCurrentAlertFile(sound: MessageSound): string | null {
  if (isBuiltinSound(sound)) {
    return IOS_CURRENT_ALERT_WAV;
  }
  if (isSystemToneSound(sound)) {
    return IOS_CURRENT_ALERT_CAF;
  }
  return null;
}

/**
 * iOS 前台 notifee `ios.sound` 派生：
 *   - `null`  → `"default"`（系统默认）
 *   - `"silent"` → `null`（调用方省略 ios.sound = 静音）
 *   - 内置/系统音 → 固定拷贝文件名
 */
export function messageSoundToIosSound(
  sound: MessageSound
): "default" | string | null {
  if (sound === null) {
    return "default";
  }
  if (sound === "silent") {
    return null;
  }
  return deriveIosCurrentAlertFile(sound);
}

/** Android notifee `createChannel({ sound })` 取值（见 sound.md §2.4 解析核实）。 */
export function messageSoundToAndroidSound(
  sound: MessageSound
): string | undefined {
  if (sound === null) {
    return "default";
  }
  if (sound === "silent") {
    return undefined;
  }
  if (isBuiltinSound(sound)) {
    return sound === "message" ? "message" : "element_fade";
  }
  if (typeof sound === "string" && sound.startsWith("content://")) {
    return sound;
  }
  return undefined;
}
