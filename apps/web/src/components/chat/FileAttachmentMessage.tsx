import {
  DownloadOutlined,
  FileExcelOutlined,
  FileImageOutlined,
  FileMarkdownOutlined,
  FilePdfOutlined,
  FilePptOutlined,
  FileTextOutlined,
  FileUnknownOutlined,
  FileWordOutlined,
  FileZipOutlined,
  Html5Outlined,
  PlaySquareOutlined,
  SoundOutlined
} from "@ant-design/icons";
import { useEffect, useMemo, useState } from "react";
import { formatFileSize, shouldAutoDownload } from "@mushroom/shared";
import type { MessageFileContent } from "@mushroom/shared";
import { useTranslation } from "react-i18next";
import type { Message } from "../../types/chat";
import { getCachedMediaAutoDownloadPreferences } from "../../services/mediaAutoDownloadPreferences";
import {
  buildMediaCachePayload,
  downloadFileInBrowser,
  hasDesktopMediaCache
} from "./messageMediaCache";

function getFileIcon(fileName?: string) {
  const ext = (fileName || "").split(".").pop()?.toLowerCase() || "";
  const iconStyle = { fontSize: 28 };

  switch (ext) {
    case "pdf":
      return <FilePdfOutlined style={iconStyle} />;
    case "doc":
    case "docx":
      return <FileWordOutlined style={iconStyle} />;
    case "xls":
    case "xlsx":
    case "csv":
      return <FileExcelOutlined style={iconStyle} />;
    case "ppt":
    case "pptx":
      return <FilePptOutlined style={iconStyle} />;
    case "zip":
    case "rar":
    case "7z":
    case "tar":
    case "gz":
      return <FileZipOutlined style={iconStyle} />;
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "bmp":
    case "svg":
    case "webp":
    case "ico":
      return <FileImageOutlined style={iconStyle} />;
    case "mp4":
    case "avi":
    case "mov":
    case "mkv":
    case "wmv":
    case "flv":
    case "webm":
      return <PlaySquareOutlined style={iconStyle} />;
    case "mp3":
    case "wav":
    case "flac":
    case "aac":
    case "ogg":
    case "wma":
      return <SoundOutlined style={iconStyle} />;
    case "txt":
    case "log":
    case "ini":
    case "conf":
    case "cfg":
      return <FileTextOutlined style={iconStyle} />;
    case "md":
      return <FileMarkdownOutlined style={iconStyle} />;
    case "html":
    case "htm":
      return <Html5Outlined style={iconStyle} />;
    default:
      return <FileUnknownOutlined style={iconStyle} />;
  }
}

export function FileAttachmentMessage(props: {
  username: string;
  message: Message;
  content: MessageFileContent;
}) {
  const { t } = useTranslation();
  const [cacheState, setCacheState] = useState<
    "checking" | "downloaded" | "not-downloaded" | "downloading"
  >("checking");

  const payload = useMemo(
    () =>
      buildMediaCachePayload({
        message: props.message,
        content: props.content,
        category: "files"
      }),
    [props.content, props.message]
  );

  useEffect(() => {
    let cancelled = false;

    async function syncCacheState() {
      if (!hasDesktopMediaCache()) {
        setCacheState("not-downloaded");
        return;
      }

      try {
        const resolved = await window.electronAPI.resolveMediaCache({
          remoteUrl: payload.remoteUrl,
          category: "files"
        });
        if (cancelled) {
          return;
        }
        if (resolved.hit) {
          setCacheState("downloaded");
          return;
        }

        // 自动下载门控：根据用户偏好（documents 类别 + 当前网络）决定是否
        // 在后台预热缓存。桌面端默认按 wifi 处理；用户主动点击不受此限制。
        const prefs = getCachedMediaAutoDownloadPreferences(props.username);
        const allowed = shouldAutoDownload({
          category: "documents",
          policy: prefs.documents,
          networkType: "wifi",
          fileSizeBytes: props.content.size ?? null
        });
        if (allowed) {
          setCacheState("downloading");
          await window.electronAPI.downloadMediaCache(payload);
          if (!cancelled) {
            setCacheState("downloaded");
          }
          return;
        }

        setCacheState("not-downloaded");
      } catch {
        if (!cancelled) {
          setCacheState("not-downloaded");
        }
      }
    }

    setCacheState("checking");
    void syncCacheState();

    return () => {
      cancelled = true;
    };
  }, [payload, props.content.size, props.username]);

  async function handleDownload() {
    if (cacheState === "downloading") {
      return;
    }

    if (!hasDesktopMediaCache()) {
      downloadFileInBrowser(props.content.url, props.content.name || "file");
      return;
    }

    setCacheState("downloading");
    try {
      await window.electronAPI.downloadMediaCache(payload);
      setCacheState("downloaded");
    } catch {
      setCacheState("not-downloaded");
      window.open(props.content.url, "_blank", "noopener,noreferrer");
    }
  }

  const isDownloaded = cacheState === "downloaded";
  const statusText =
    cacheState === "downloading" || cacheState === "checking"
      ? t("chat.fileCacheDownloading")
      : isDownloaded
        ? t("chat.fileCacheDownloaded")
        : t("chat.fileCacheNotDownloaded");

  return (
    <div className="im-file-message-card" onClick={() => void handleDownload()}>
      <div className="im-file-message-icon" aria-hidden="true">
        {getFileIcon(props.content.name)}
      </div>
      <div className="im-file-message-info">
        <span className="im-file-message-title">{props.content.name}</span>
        <span className="im-file-message-meta">
          {formatFileSize(props.content.size)}
          <span
            className={isDownloaded ? "im-file-message-cache-status-ready" : ""}
          >
            {statusText}
          </span>
        </span>
      </div>
      {!isDownloaded &&
        cacheState !== "downloading" &&
        cacheState !== "checking" && (
          <div
            className="im-file-message-download-indicator"
            aria-hidden="true"
          >
            <DownloadOutlined style={{ fontSize: 18 }} />
          </div>
        )}
    </div>
  );
}
