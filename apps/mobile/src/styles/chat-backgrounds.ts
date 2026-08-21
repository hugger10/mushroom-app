import type { ImageSourcePropType } from "react-native";
import chatDoodleDark from "../assets/chat-doodle-dark.png";
import chatDoodleLight from "../assets/chat-doodle-light.png";
import chatBgLavender from "../assets/chat-backgrounds/chat-bg-lavender.png";
import chatBgMidnight from "../assets/chat-backgrounds/chat-bg-midnight.png";
import chatBgMint from "../assets/chat-backgrounds/chat-bg-mint.png";
import chatBgOcean from "../assets/chat-backgrounds/chat-bg-ocean.png";
import chatBgSunset from "../assets/chat-backgrounds/chat-bg-sunset.png";

/**
 * 聊天背景预设集合。
 *
 * 新增背景只需要两步：
 * 1. 把图片放入 `apps/mobile/src/assets/chat-backgrounds/`，命名 `chat-bg-<id>.png`
 *    （可选 `chat-bg-<id>-dark.png` 深色变体，不提供时深色模式自动叠加暗色遮罩）。
 * 2. 在下方 `CHAT_BACKGROUND_IDS` / `CHAT_BACKGROUND_PRESETS` 中登记。
 */
export type ChatBackgroundId =
  | "doodle"
  | "mint"
  | "ocean"
  | "sunset"
  | "lavender"
  | "midnight";

export const CHAT_BACKGROUND_IDS: ChatBackgroundId[] = [
  "doodle",
  "mint",
  "ocean",
  "sunset",
  "lavender",
  "midnight"
];

export type ChatBackgroundResizeMode = "cover" | "repeat";

/**
 * 照片类背景在深色模式下的暗色遮罩色，保证气泡文字可读。
 * `chat-styles.ts` 与 `chat-background-styles.ts` 共用此常量，避免漂移。
 */
export const CHAT_BACKGROUND_DARK_OVERLAY = "rgba(17, 27, 33, 0.6)";

export type ChatBackgroundPreset = {
  id: ChatBackgroundId;
  /** i18n 标签 key，如 `me.chatBackgroundPage.presets.doodle`。 */
  i18nKey: string;
  light: ImageSourcePropType;
  /** 主题专属变体；缺省时深色模式会对 `light` 叠加暗色遮罩。 */
  dark?: ImageSourcePropType;
  resizeMode: ChatBackgroundResizeMode;
};

export const CHAT_BACKGROUND_PRESETS: Record<
  ChatBackgroundId,
  ChatBackgroundPreset
> = {
  doodle: {
    id: "doodle",
    i18nKey: "me.chatBackgroundPage.presets.doodle",
    light: chatDoodleLight,
    dark: chatDoodleDark,
    resizeMode: "cover"
  },
  mint: {
    id: "mint",
    i18nKey: "me.chatBackgroundPage.presets.mint",
    light: chatBgMint,
    resizeMode: "cover"
  },
  ocean: {
    id: "ocean",
    i18nKey: "me.chatBackgroundPage.presets.ocean",
    light: chatBgOcean,
    resizeMode: "cover"
  },
  sunset: {
    id: "sunset",
    i18nKey: "me.chatBackgroundPage.presets.sunset",
    light: chatBgSunset,
    resizeMode: "cover"
  },
  lavender: {
    id: "lavender",
    i18nKey: "me.chatBackgroundPage.presets.lavender",
    light: chatBgLavender,
    resizeMode: "cover"
  },
  midnight: {
    id: "midnight",
    i18nKey: "me.chatBackgroundPage.presets.midnight",
    light: chatBgMidnight,
    resizeMode: "cover"
  }
};

export type ResolvedChatBackground = {
  source: ImageSourcePropType;
  resizeMode: ChatBackgroundResizeMode;
  /** 照片类背景在深色模式下的暗色遮罩，保证文字可读。 */
  darkOverlay: boolean;
};

/**
 * 解析某个背景 id 在当前主题下的渲染参数。找不到预设时回退到默认涂鸦，
 * 保证存储脏值不会导致白屏。
 */
export function resolveChatBackground(
  id: ChatBackgroundId | null | undefined,
  themeMode: "light" | "dark"
): ResolvedChatBackground {
  const preset =
    (id && CHAT_BACKGROUND_PRESETS[id]) || CHAT_BACKGROUND_PRESETS.doodle;
  const source =
    themeMode === "dark" && preset.dark ? preset.dark : preset.light;
  return {
    source,
    resizeMode: preset.resizeMode,
    darkOverlay: themeMode === "dark" && !preset.dark
  };
}

/** 归一化存储值：非法的 id 一律回退默认，避免脏数据。 */
export function normalizeChatBackgroundId(
  value: string | null | undefined
): ChatBackgroundId {
  return value && CHAT_BACKGROUND_IDS.includes(value as ChatBackgroundId)
    ? (value as ChatBackgroundId)
    : "doodle";
}
