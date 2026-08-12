import { useEffect, useState } from "react";
import type {
  MediaAutoDownloadPolicy,
  Message,
  MessageFileContent
} from "@mushroom/shared";
import type { NetworkType } from "../../../../platform/network-type";
import {
  downloadMobileMediaCache,
  resolveMobileMediaCache,
  resolveMobileMediaCacheSync
} from "../../../../platform/media-cache";
import { shouldAutoDownload } from "../../../storage";
import { buildCacheInput } from "../utils/buildCacheInput";

/**
 * 图片消息的本地缓存读取 + 按策略自动下载。
 *
 * 与桌面端 / Web 行为一致：
 * 1. 先 `resolveMobileMediaCache` 读取已缓存的本地 URI（status === "ready"）。
 * 2. 若策略允许（`shouldAutoDownload({ category: "photos" })`）则后台 download；
 *    下载成功后将 localUri 写入 state，供 UI 立即切换为本地源。
 * 3. 失败：保持服务端 URL 由 `useAttachmentDisplayUri` 兜底，不影响显示。
 */
export function useImageCache(input: {
  content: MessageFileContent | null;
  message: Message;
  cacheUsername: string;
  isRecalled: boolean;
  networkType: NetworkType;
  policy: MediaAutoDownloadPolicy;
}) {
  const { content, message, cacheUsername, isRecalled, networkType, policy } =
    input;

  const [imageCacheUri, setImageCacheUri] = useState<string | null>(() => {
    if (!content || isRecalled) return null;
    try {
      const cacheInput = buildCacheInput({
        username: cacheUsername,
        message,
        content,
        category: "images"
      });
      const record = resolveMobileMediaCacheSync(cacheInput);
      return record?.localUri ?? null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (!content || isRecalled) {
      setImageCacheUri(null);
      return;
    }

    let cancelled = false;
    const cacheInput = buildCacheInput({
      username: cacheUsername,
      message,
      content,
      category: "images"
    });
    try {
      const syncRecord = resolveMobileMediaCacheSync(cacheInput);
      setImageCacheUri(syncRecord?.localUri ?? null);
    } catch {
      setImageCacheUri(null);
    }
    void resolveMobileMediaCache(cacheInput)
      .then(record => {
        if (!cancelled && record?.status === "ready" && record.localUri) {
          setImageCacheUri(record.localUri);
        }
      })
      .catch(() => undefined);
    const allowAutoImage = shouldAutoDownload({
      category: "photos",
      policy,
      networkType,
      fileSizeBytes: content.size
    });
    if (allowAutoImage) {
      void downloadMobileMediaCache(cacheInput, { auto: true })
        .then(() => {
          // 下载成功后不主动设置 imageCacheUri，避免 <Image source>
          // 从远程 URL 切换到本地 file:// URI 时清空重载导致闪白。
          // 本地缓存文件已写入磁盘，下次挂载或 URL 自愈失败时由
          // resolveMobileMediaCacheSync 命中缓存，从初始渲染即使用本地文件。
        })
        .catch(() => {
          /* hook 会处理过期 URL 的自愈；下载失败时仅缺本地缓存，
             不影响 hook 用服务端 URL 继续渲染。 */
        });
    }

    return () => {
      cancelled = true;
    };
    // 与原始组件保持一致的依赖列表；message 字段使用 server/client id 唯一标识。
  }, [
    content?.url,
    content?.name,
    content?.mime_type,
    content?.size,
    isRecalled,
    message.server_message_id,
    message.client_message_id,
    cacheUsername,
    policy,
    networkType
  ]);

  return { imageCacheUri };
}
