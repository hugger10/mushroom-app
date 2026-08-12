/**
 * 内置铃声注册表。iOS 文件名（main bundle）/ Android raw 资源名。
 * 音频文件由开发者提供：iOS `ios/Mesh/Sounds/*.wav`，Android `res/raw/*.wav`
 */
export const BUILTIN_TONES = {
  message: { ios: "message.wav", android: "message" },
  fade: { ios: "fade.wav", android: "element_fade" }
} as const;

export type BuiltinToneId = keyof typeof BUILTIN_TONES;

export const BUILTIN_TONE_IDS = Object.keys(
  BUILTIN_TONES
) as readonly BuiltinToneId[];
