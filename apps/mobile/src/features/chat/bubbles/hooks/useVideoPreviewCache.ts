import { useEffect } from "react";
import type {
  MediaAutoDownloadPolicy,
  Message,
  MessageFileContent
} from "@mushroom/shared";
import type { NetworkType } from "../../../../platform/network-type";
import {
  downloadMobileMediaCache,
  resolveMobileMediaCache
} from "../../../../platform/media-cache";
import { shouldAutoDownload } from "../../../storage";
import { buildCacheInput } from "../utils/buildCacheInput";

/**
 * 视频附件的「按策略后台预下载」副作用。
 *
 * 原本本 hook 还负责解析本地缓存 file:// URI 用于 <Video> 当封面，
 * 但该用法在封面渲染上已被废弃（避免预签名 URL 过期与流量浪费），
 * 因此移除返回值，本 hook 现在只负责触发预下载，不返回任何状态。
 */
export function useVideoPreviewCache(input: {
  content: MessageFileContent | null;
  message: Message;
  cacheUsername: string;
  isRecalled: boolean;
  networkType: NetworkType;
  policy: MediaAutoDownloadPolicy;
}): void {
  const { content, message, cacheUsername, isRecalled, networkType, policy } =
    input;

  useEffect(() => {
    if (!content || isRecalled) {
      return;
    }
    const allowAutoVideo = shouldAutoDownload({
      category: "videos",
      policy,
      networkType,
      fileSizeBytes: content.size
    });
    if (!allowAutoVideo) {
      return;
    }
    let cancelled = false;
    const cacheInput = buildCacheInput({
      username: cacheUsername,
      message,
      content,
      category: "video"
    });
    void resolveMobileMediaCache(cacheInput)
      .then(record => {
        if (cancelled || record?.status === "ready") {
          return;
        }
        void downloadMobileMediaCache(cacheInput, { auto: true }).catch(
          () => undefined
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
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
}
