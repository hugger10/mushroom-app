import { useEffect, useState } from "react";
import {
  isAudioFileMessageContent,
  isImageFileMessageContent,
  isVideoFileMessageContent,
  shouldAutoDownload
} from "@mushroom/shared";
import type { MessageFileContent } from "@mushroom/shared";
import type { Message } from "../../types/chat";
import { getCachedMediaAutoDownloadPreferences } from "../../services/mediaAutoDownloadPreferences";

export type MessageMediaCacheCategory =
  | "images"
  | "files"
  | "voice"
  | "video"
  | "thumbs";

export function hasDesktopMediaCache() {
  return (
    typeof window !== "undefined" &&
    typeof window.electronAPI?.downloadMediaCache === "function"
  );
}

export function buildMediaCachePayload(input: {
  message: Message;
  content: MessageFileContent;
  category: MessageMediaCacheCategory;
}) {
  return {
    remoteUrl: input.content.url,
    category: input.category,
    messageId:
      input.message.server_message_id || input.message.client_message_id,
    uploadId: input.content.upload_id ?? null,
    originalName: input.content.name,
    mimeType: input.content.mime_type ?? null,
    size: input.content.size,
    createdAt: input.message.created_at,
    clientConversationId: input.message.client_conversation_id ?? null
  };
}

export function resolveMessageMediaCacheCategory(
  content: MessageFileContent
): "images" | "files" | "voice" | "video" {
  if (isImageFileMessageContent(content)) {
    return "images";
  }
  if (isVideoFileMessageContent(content)) {
    return "video";
  }
  if (isAudioFileMessageContent(content)) {
    return "voice";
  }
  return "files";
}

export function useCachedMediaUrl(input: {
  username: string;
  message: Message;
  content: MessageFileContent;
  category: "images";
}) {
  const [sourceUrl, setSourceUrl] = useState(input.content.url);

  useEffect(() => {
    let cancelled = false;
    setSourceUrl(input.content.url);
    if (!hasDesktopMediaCache()) {
      return;
    }

    // 自动下载门控（图片归属共享层 photos 类别）。桌面端默认按 wifi 网络处理。
    const prefs = getCachedMediaAutoDownloadPreferences(input.username);
    const allowed = shouldAutoDownload({
      category: "photos",
      policy: prefs.photos,
      networkType: "wifi",
      fileSizeBytes: input.content.size ?? null
    });
    if (!allowed) {
      return;
    }

    window.electronAPI
      .downloadMediaCache(
        buildMediaCachePayload({
          message: input.message,
          content: input.content,
          category: input.category
        })
      )
      .then(record => {
        if (!cancelled) {
          setSourceUrl(record.localUrl);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSourceUrl(input.content.url);
        }
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Intentionally depend on primitive values only to avoid re-downloading on every render
  }, [
    input.category,
    input.content.url,
    input.message.client_message_id,
    input.username
  ]);

  return sourceUrl;
}

export function downloadFileInBrowser(url: string, name: string) {
  fetch(url)
    .then(res => res.blob())
    .then(blob => {
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    })
    .catch(() => {
      window.open(url, "_blank", "noopener,noreferrer");
    });
}
