import type zhCN from "./locales/zh-CN";

/**
 * 翻译资源的结构契约。
 *
 * 以基准语言 zh-CN 为准，所有其它语言文件必须满足同样的 key 结构。
 * 若新增/删除/重命名了 zh-CN 中的 key，TypeScript 会在编译期提示其它语言文件需要同步更新。
 */
export type TranslationSchema = typeof zhCN;
