import { useEffect, useState } from "react";
import {
  DEFAULT_ATTACHMENT_SIZE_LIMITS,
  type MediaAutoDownloadPolicy,
  type Message,
  type MessageFileContent
} from "@mushroom/shared";
import type { NetworkType } from "../../../../platform/network-type";
import {
  downloadMobileMediaCache,
  resolveMobileMediaCache,
  subscribeCacheWrites
} from "../../../../platform/media-cache";
import { shouldAutoDownload } from "../../../storage";
import { buildCacheInput } from "../utils/buildCacheInput";

export type FileCacheState =
  | "idle"
  | "checking"
  | "downloading"
  | "downloaded"
  | "not-downloaded";

/**
 * 通用文件附件的「三态机」缓存状态：
 *
 * idle → checking → (downloaded | downloading → downloaded/not-downloaded | not-downloaded)
 *
 * 仅当 `shouldAutoDownload({ category: "documents" })` 且文件大小不超过
 * `DEFAULT_ATTACHMENT_SIZE_LIMITS.file` 时才会自动下载；否则维持
 * `not-downloaded`，由 UI 提示「点击下载」。
 */
export function useFileCache(input: {
  content: MessageFileContent | null;
  message: Message;
  cacheUsername: string;
  isRecalled: boolean;
  networkType: NetworkType;
  policy: MediaAutoDownloadPolicy;
}) {
  const [fileCacheState, setFileCacheState] = useState<FileCacheState>("idle");
  const { content, message, cacheUsername, isRecalled, networkType, policy } =
    input;

  useEffect(() => {
    if (!content || isRecalled) {
      setFileCacheState("idle");
      return;
    }

    setFileCacheState("checking");

    let cancelled = false;
    const cacheInput = buildCacheInput({
      username: cacheUsername,
      message,
      content,
      category: "files"
    });
    void resolveMobileMediaCache(cacheInput)
      .then(record => {
        if (cancelled) {
          return;
        }
        if (record?.status === "ready") {
          setFileCacheState("downloaded");
          return;
        }
        const allowAutoFile =
          content.size <= DEFAULT_ATTACHMENT_SIZE_LIMITS.file &&
          shouldAutoDownload({
            category: "documents",
            policy,
            networkType,
            fileSizeBytes: content.size
          });
        if (allowAutoFile) {
          setFileCacheState("downloading");
          void downloadMobileMediaCache(cacheInput, { auto: true })
            .then(() => {
              if (!cancelled) {
                setFileCacheState("downloaded");
              }
            })
            .catch(() => {
              if (!cancelled) {
                setFileCacheState("not-downloaded");
              }
            });
          return;
        }
        setFileCacheState("not-downloaded");
      })
      .catch(() => {
        if (!cancelled) {
          setFileCacheState("not-downloaded");
        }
      });

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

  // 订阅外部缓存写入事件（如"保存到手机"），写入后主动重新检查缓存状态。
  useEffect(() => {
    if (!content || isRecalled) return;

    const cacheInput = buildCacheInput({
      username: cacheUsername,
      message,
      content,
      category: "files"
    });

    const unsub = subscribeCacheWrites(payload => {
      if (
        payload.remoteUrl === cacheInput.remoteUrl ||
        (payload.uploadId &&
          cacheInput.uploadId &&
          payload.uploadId === cacheInput.uploadId)
      ) {
        void resolveMobileMediaCache(cacheInput).then(record => {
          if (record?.status === "ready") {
            setFileCacheState("downloaded");
          }
        });
      }
    });

    return unsub;
  }, [
    content?.url,
    content?.upload_id,
    content?.name,
    content?.mime_type,
    content?.size,
    isRecalled,
    message.server_message_id,
    message.client_message_id,
    cacheUsername
  ]);

  return { fileCacheState };
}
