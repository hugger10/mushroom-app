/**
 * Web 端「会话级附件 URL 预刷新」去重缓存。
 *
 * 用途：进入会话时一次性把首屏可见消息的 upload_ids 批量送给
 * `/file/attachment/refresh-urls` 预刷新（A 方案）。如果用户来回切换
 * 同一个会话或在多个会话间反复跳转，应在 TTL 之内跳过重复请求，
 * 避免接口被反复调用。
 *
 * TTL 选择 30 分钟：服务端 `UPLOAD_PRESIGNED_EXPIRES_SECONDS` 默认 1h，
 * 留出至少 30 分钟安全余量；过期后用户回来时主动再预刷新一次。
 *
 * 模块级 Map 跨组件实例共享；账号切换 / logout 必须显式清理（见
 * `resetConversationPreRefreshCache`），否则跨账号同名会话 id 会被
 * 误判为"刚刷新过"。由 `apps/web/src/App.tsx` 的 `onAuthTokensChanged`
 * 监听器统一调用。
 */

export const conversationPreRefreshedAt = new Map<string, number>();
export const PRE_REFRESH_TTL_MS = 30 * 60 * 1000;

export function resetConversationPreRefreshCache(): void {
  conversationPreRefreshedAt.clear();
}
