import { useEffect } from "react";
import type {
  MediaAutoDownloadPolicy,
  Message,
  VoiceFileMessageContent
} from "@mushroom/shared";
import type { NetworkType } from "../../../../platform/network-type";
import {
  downloadMobileMediaCache,
  resolveMobileMediaCache
} from "../../../../platform/media-cache";
import { shouldAutoDownload } from "../../../storage";
import { buildCacheInput } from "../utils/buildCacheInput";

/**
 * 语音消息「到达即缓存」预热。
 *
 * 仅做后台预热：若策略允许（`audio`）且尚未缓存，则触发一次自动下载。
 * 用户主动播放走另一条直通路径（VoiceBubbleContent / actions），本 hook
 * 不与播放器交互，也不更新组件 state。
 */
export function useVoicePrefetch(input: {
  content: VoiceFileMessageContent | null;
  message: Message;
  cacheUsername: string;
  isRecalled: boolean;
  networkType: NetworkType;
  policy: MediaAutoDownloadPolicy;
}) {
  const { content, message, cacheUsername, isRecalled, networkType, policy } =
    input;

  useEffect(() => {
    if (!content || isRecalled) {
      return;
    }
    const allowAutoVoice = shouldAutoDownload({
      category: "audio",
      policy,
      networkType,
      fileSizeBytes: content.size
    });
    if (!allowAutoVoice) {
      return;
    }
    let cancelled = false;
    const cacheInput = buildCacheInput({
      username: cacheUsername,
      message,
      content,
      category: "voice"
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
