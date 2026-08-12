import enUS from "./en-US";
import zhCN from "./zh-CN";

/**
 * 语言注册表。
 *
 * 后续新增语言只需：
 *   1) 在当前目录添加 `<bcp47>.ts`，例如 `ja-JP.ts`；
 *   2) 在此对象中追加一行 `"ja-JP": { translation: jaJP, label: "日本語" }`；
 *   3) 如需让浏览器/系统语言能正确匹配到新语言，请同步调整 `index.ts` 中
 *      `normalizeMushroomLanguage` 的前缀映射表。
 */
export const locales = {
  "zh-CN": { translation: zhCN, label: "简体中文" },
  "en-US": { translation: enUS, label: "English" }
} as const;

export type MushroomSupportedLanguage = keyof typeof locales;
