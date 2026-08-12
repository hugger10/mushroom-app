// 日志辅助：登录/同步时 IPC payload 通常很大（一个用户全部会话/消息），
// 直接 log.debug 整个对象会把单条日志撑到几百行。这里只输出 count，
// 满足排错可见性的同时避免刷屏。需要看到完整内容时临时改回即可。
export function fmtCount(list: unknown): string {
  if (Array.isArray(list)) return `count=${list.length}`;
  if (list && typeof list === "object")
    return `count=${Object.keys(list as Record<string, unknown>).length}`;
  return "count=0";
}

/**
 * Maximum number of bound parameters per SQLite statement we are willing
 * to use. better-sqlite3 inherits the SQLite default
 * `SQLITE_MAX_VARIABLE_NUMBER`, which is 999 on the upstream build shipped
 * with most distributions. Stay well under that to leave room for joins
 * that already consume a few placeholders.
 */
export const SELECT_BY_CLIENT_ID_CHUNK = 500;
