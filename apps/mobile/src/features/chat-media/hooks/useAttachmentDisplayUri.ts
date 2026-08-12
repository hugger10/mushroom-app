/**
 * 统一的「附件展示 URL 解析 + 自愈」Hook（移动端）。
 *
 * 解决问题：聊天气泡（`MessageBubble`）和媒体网格（`MediaCell`）渲染
 * 同一附件时，预签名 URL 过期后 `<Image>` 会显示为灰底白屏。本 hook
 * 把 mobile 端原本只在 `MessageBubble` 里实现的「优先级回退 +
 * `refresh-urls` 自愈 + 内存订阅重渲染」逻辑抽出复用，确保所有渲染点
 * 行为一致，避免漂移。
 *
 * 工作流程：
 *   1. 用 `pickAttachmentDisplayUri` 合并：
 *        localCacheUri > refreshed.preview_url > content.preview_url
 *        > refreshed.thumb_url > content.thumb_url
 *        > refreshed.url > content.url
 *   2. `<Image onError>` → `handleError()`：每个 uploadId 只触发一次
 *      `refreshAttachmentUrlsAndCache`（dedupe，避免网格里几十个 cell
 *      指向同一附件时风暴）。
 *   3. 订阅 `subscribeToAttachmentRefresh`：拿到新签名 URL 后强制重渲染，
 *      hook 返回最新 displayUri。
 *   4. 已自愈但仍失败 → `unavailable = true`，UI 决定如何降级（聊天
 *      气泡显示「图片未缓存」占位；媒体网格保持灰色背景）。
 *
 * 本 hook 不负责发起本地缓存的下载 —— 是否预下载由调用方按业务策略
 * 决定（气泡走 `auto-download` 设置；网格不主动下载，只读已有缓存）。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { MessageFileContent } from "@mushroom/shared";
import {
  pickAttachmentDisplayUri,
  pickAttachmentPreviewUrl,
  pickVideoCoverUrl
} from "@mushroom/shared";
import {
  getRefreshedAttachment,
  refreshAttachmentUrlsAndCache,
  subscribeToAttachmentRefresh
} from "../../../services/refresh-attachment-urls";

export interface UseAttachmentDisplayUriResult {
  /** 当前应该传给 `<Image source={{ uri }}>` 的 URI，可能为 null。 */
  displayUri: string | null;
  /**
   * 已尝试自愈且最终仍失败：
   * - 没有本地缓存
   * - 也没有任何可用 preview/thumb/url
   * - `<Image onError>` 触发后刷新 URL 仍未成功
   *
   * UI 应据此渲染降级占位（灰底图标 / 自定义提示）。
   */
  unavailable: boolean;
  /** 绑定到 `<Image onError={handleError}>`。 */
  handleError: () => void;
}

export function useAttachmentDisplayUri(
  content: MessageFileContent | null | undefined,
  options?: {
    /**
     * 本地下载缓存的 file:// URI。调用方（如 `MessageBubble`）通过
     * `resolveMobileMediaCache` 解析后传入；不传则只使用服务端 URL。
     */
    localCacheUri?: string | null;
    /**
     * 是否启用自愈。撤回消息等场景可传 false 直接禁用。
     */
    enabled?: boolean;
    /**
     * 只取 preview/thumb，不回退到原文件 URL。
     *
     * 适用于「网格里混排视频缩略图」等场景：视频原 URL 是 .mp4，
     * 传给 `<Image>` 必然解码失败 → 触发无效的 refresh-urls 请求。
     * 开启后无 preview/thumb 时直接返回 null，由 UI 渲染灰底占位，
     * 也不会触发自愈请求（`handleError` 会短路）。
     *
     * 启用 previewOnly 时会忽略 `localCacheUri`（视频网格本就没有
     * 缩略图本地缓存可用）。
     */
    previewOnly?: boolean;
    /**
     * 自愈成功后用于写回 SQLite 的消息标识（client_message_id 或
     * server_message_id 均可）。不传则只更新内存缓存。
     */
    messageId?: string | null;
  }
): UseAttachmentDisplayUriResult {
  const enabled = options?.enabled !== false;
  const previewOnly = options?.previewOnly === true;
  const localCacheUri = previewOnly ? null : (options?.localCacheUri ?? null);
  const uploadId = content?.upload_id ?? null;
  // 视频封面对应的独立 image 附件（content.thumb_url 存的是它的预签名 URL）。
  // 主视频附件 thumb_status='none'，按 uploadId 刷新拿不到封面 URL，
  // 必须把封面附件一并纳入刷新与取数。
  const thumbnailUploadId = content?.thumbnail_upload_id ?? null;
  const messageId = options?.messageId ?? null;

  // 用于强制重渲染：subscribe 回调里 bump 计数。
  const [, setTick] = useState(0);
  const [unavailable, setUnavailable] = useState(false);
  const triedRef = useRef<Set<string>>(new Set());

  // 内容/上下文变化时清空「已不可用」标记，重新给一次机会。
  useEffect(() => {
    setUnavailable(false);
  }, [
    content?.url,
    content?.thumb_url,
    content?.preview_url,
    content?.thumbnail_upload_id,
    localCacheUri
  ]);

  useEffect(() => {
    if (!enabled) return;
    return subscribeToAttachmentRefresh(updatedIds => {
      if (!uploadId) return;
      if (
        updatedIds.includes(uploadId) ||
        (thumbnailUploadId != null && updatedIds.includes(thumbnailUploadId))
      ) {
        // 新签名 URL 已落入 memoryCache → bump 重渲染读取。
        setTick(t => t + 1);
        // 拿到新 URL 后给 <Image> 一次重新尝试的机会。
        setUnavailable(false);
      }
    });
  }, [enabled, uploadId, thumbnailUploadId]);

  const handleError = useCallback(() => {
    if (!enabled || !uploadId) {
      setUnavailable(true);
      return;
    }
    if (triedRef.current.has(uploadId)) {
      // 已尝试过自愈，仍失败 → 标记不可用。
      setUnavailable(true);
      return;
    }
    triedRef.current.add(uploadId);
    // 封面附件（thumbnail_upload_id）一并刷新：服务端按传入 id 解析，
    // 封面附件的 object_name 即视频封面原图，能拿到新的封面 URL。
    const ids = [uploadId, thumbnailUploadId].filter(
      (id): id is string => id != null && id.length > 0
    );
    void refreshAttachmentUrlsAndCache(
      ids,
      messageId
        ? {
            messageIds: {
              [uploadId]: messageId,
              ...(thumbnailUploadId ? { [thumbnailUploadId]: messageId } : {})
            }
          }
        : undefined
    ).then(map => {
      // 服务端返回为空 / 失败 → 标记不可用。
      // 注意：成功的情况下 subscribe 回调会触发重渲染。
      if (!map[uploadId]) {
        setUnavailable(true);
      }
    });
  }, [enabled, uploadId, thumbnailUploadId, messageId]);

  if (!content) {
    return { displayUri: null, unavailable: false, handleError };
  }

  const refreshed = uploadId ? getRefreshedAttachment(uploadId) : undefined;
  // 封面附件刚刷新的 URL 优先于 content.thumb_url（旧签名已过期时能自愈）。
  const thumbRefreshed =
    thumbnailUploadId != null
      ? getRefreshedAttachment(thumbnailUploadId)
      : undefined;
  const coverUri = pickVideoCoverUrl(content, thumbRefreshed);
  const displayContent = coverUri
    ? { ...content, thumb_url: coverUri }
    : content;
  const displayUri = previewOnly
    ? pickAttachmentPreviewUrl(displayContent, refreshed)
    : pickAttachmentDisplayUri(displayContent, refreshed, localCacheUri);

  return { displayUri, unavailable, handleError };
}
