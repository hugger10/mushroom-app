import { locales, type MushroomSupportedLanguage } from "./locales";

export type { MushroomSupportedLanguage };
export type { TranslationSchema } from "./types";

export const MUSHROOM_DEFAULT_LANGUAGE: MushroomSupportedLanguage = "zh-CN";

export const MUSHROOM_SUPPORTED_LANGUAGES = Object.keys(
  locales
) as MushroomSupportedLanguage[];

export const MUSHROOM_LANGUAGE_LABELS = Object.fromEntries(
  (
    Object.entries(locales) as Array<
      [MushroomSupportedLanguage, (typeof locales)[MushroomSupportedLanguage]]
    >
  ).map(([code, def]) => [code, def.label])
) as Record<MushroomSupportedLanguage, string>;

export const mushroomI18nResources = Object.fromEntries(
  (
    Object.entries(locales) as Array<
      [MushroomSupportedLanguage, (typeof locales)[MushroomSupportedLanguage]]
    >
  ).map(([code, def]) => [code, { translation: def.translation }])
) as Record<
  MushroomSupportedLanguage,
  { translation: (typeof locales)[MushroomSupportedLanguage]["translation"] }
>;

/**
 * BCP-47 语言前缀到内置受支持语言的映射。
 *
 * 新增语言时，如果其前缀（如 "ja"、"ko"）不属于现有语言族，
 * 请在此追加对应映射，以便从系统/浏览器语言自动解析。
 */
const LANGUAGE_PREFIX_MAP: Array<[string, MushroomSupportedLanguage]> = [
  ["zh", "zh-CN"],
  ["en", "en-US"]
];

export function normalizeMushroomLanguage(
  value?: string | null
): MushroomSupportedLanguage | null {
  if (!value) {
    return null;
  }

  const normalized = value.toLowerCase();

  for (const [prefix, language] of LANGUAGE_PREFIX_MAP) {
    if (normalized.startsWith(prefix)) {
      return language;
    }
  }

  return null;
}

export function resolveMushroomLanguage(params: {
  preferredLanguage?: string | null;
  systemLanguage?: string | null;
  defaultLanguage?: MushroomSupportedLanguage;
}) {
  const preferred = normalizeMushroomLanguage(params.preferredLanguage);
  if (preferred) {
    return preferred;
  }

  const systemLanguage = normalizeMushroomLanguage(params.systemLanguage);
  if (systemLanguage) {
    return systemLanguage;
  }

  return params.defaultLanguage ?? MUSHROOM_DEFAULT_LANGUAGE;
}

export function getNextMushroomLanguage(
  currentLanguage?: string | null
): MushroomSupportedLanguage {
  return normalizeMushroomLanguage(currentLanguage) === "zh-CN"
    ? "en-US"
    : "zh-CN";
}
