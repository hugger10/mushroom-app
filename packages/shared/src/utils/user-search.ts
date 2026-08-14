export type UserSearchMode = "phone" | "username";

export type UserSearchClass = UserSearchMode | "too-short";

/** 去除手机号常见分隔符（空格、连字符、括号）。 */
export function compactPhone(raw: string): string {
  return raw.trim().replace(/[\s\-()]/g, "");
}

/**
 * 手机号整号精确匹配的前端/后端统一格式校验。
 * 去分隔符后：
 *   - 不带国家码：7-15 位纯数字（如 13800138000）
 *   - 带国家码：`+` 后 7-14 位数字（E.164）
 * 输入 1、2、138 这类明显不是完整手机号的短串会校验失败。
 */
export function isValidPhoneInput(raw: string): boolean {
  const compact = compactPhone(raw);
  if (/^\d{7,15}$/.test(compact)) {
    return true;
  }
  return /^\+\d{7,14}$/.test(compact);
}

/**
 * 把搜索输入归类为手机号 / 用户名 / 过短。
 * 纯数字或带 `+` 的输入按手机号处理；长度不足以构成手机号时返回
 * `"too-short"`（调用方应不发请求）；其余按用户名子串搜索。
 */
export function classifyUserSearchInput(raw: string): UserSearchClass {
  const compact = compactPhone(raw);
  if (!compact) {
    return "too-short";
  }
  if (/^\d+$/.test(compact) || /^\+\d+$/.test(compact)) {
    return isValidPhoneInput(compact) ? "phone" : "too-short";
  }
  return "username";
}
