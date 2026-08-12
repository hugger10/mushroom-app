/**
 * Web 端「附件刷新后 URL」的进程内内存缓存。
 *
 * 背景：`refreshAttachmentUrlsAndPersist` 仅在 Electron 环境下会把刷新
 * 结果写入主进程 SQLite（通过 `window.electronAPI.updateMessageAttachment`），
 * 纯浏览器环境下没有任何落地，新 URL 会被直接丢弃，导致 `<img>` 即便
 * 触发了 `onError → refresh-urls` 也拿不到新值，最终永久显示为破图。
 *
 * 本模块提供模块级 `Map<uploadId, RefreshedAttachmentUrls>`，对齐
 * mobile 端 `refresh-attachment-urls.ts` 中的 `getRefreshedAttachment`
 * 模式：刷新成功后立即写入，供 `useAttachmentDisplayUrl` 在下一次
 * re-render 时（由 `setBust` 触发）读取并合并到展示 URL。
 *
 * 仅内存、不持久化、不跨标签页 —— 浏览器刷新即丢失，下次需要时再
 * 触发一次自愈即可。
 */

import type { RefreshedAttachmentUrls } from "@mushroom/shared";

const cache = new Map<string, RefreshedAttachmentUrls>();

export function getRefreshedAttachmentWeb(
  uploadId: string | null | undefined
): RefreshedAttachmentUrls | null {
  if (!uploadId) return null;
  return cache.get(uploadId) ?? null;
}

export function setRefreshedAttachmentWeb(
  uploadId: string,
  info: RefreshedAttachmentUrls
): void {
  if (!uploadId) return;
  cache.set(uploadId, info);
}

/**
 * 清空进程内附件刷新缓存。
 *
 * 调用时机：用户 logout / 切换账号。当前账号自愈过的 presigned URL 对下一个
 * 账号毫无意义（且若 upload_id 在另一个账号下不可访问，残留会导致显示破图）。
 * 由 `apps/web/src/App.tsx` 的 `onAuthTokensChanged` 监听器统一调用。
 */
export function resetRefreshedAttachmentWebCache(): void {
  cache.clear();
}
