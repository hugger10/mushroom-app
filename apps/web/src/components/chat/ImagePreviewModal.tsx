import type { PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { Modal, Spin } from "antd";
import {
  ZoomInOutlined,
  ZoomOutOutlined,
  UndoOutlined,
  LeftOutlined,
  RightOutlined,
  ExpandOutlined,
  DownloadOutlined
} from "@ant-design/icons";
import {
  formatFileSize,
  isFileMessageContent,
  pickAttachmentDisplayUri
} from "@mushroom/shared";
import { useTranslation } from "react-i18next";
import type { Message } from "../../types/chat";
import { refreshAttachmentUrlsAndPersist } from "../../http/refreshAttachmentUrls";
import { getRefreshedAttachmentWeb } from "../../http/refreshedAttachmentCache";
import { hasDesktopMediaCache } from "./messageMediaCache";

interface ImagePreviewModalProps {
  previewImage: Message | null;
  previewImageIndex: number | null;
  previewImageItems: Message[];
  previewZoom: number;
  previewOffset: { x: number; y: number };
  canPreviewPrev: boolean;
  canPreviewNext: boolean;
  onCancel: () => void;
  onZoomChange: (updater: number | ((prev: number) => number)) => void;
  onPrev: () => void;
  onNext: () => void;
  onWheel: (event: WheelEvent) => void;
  onPointerDown: (event: ReactPointerEvent<HTMLImageElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLImageElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLImageElement>) => void;
}

export function ImagePreviewModal({
  previewImage,
  previewImageIndex,
  previewImageItems,
  previewZoom,
  previewOffset,
  canPreviewPrev,
  canPreviewNext,
  onCancel,
  onZoomChange,
  onPrev,
  onNext,
  onWheel,
  onPointerDown,
  onPointerMove,
  onPointerUp
}: ImagePreviewModalProps) {
  const { t } = useTranslation();
  const stageRef = useRef<HTMLDivElement>(null);
  const [previewSourceUrl, setPreviewSourceUrl] = useState("");
  const [isResolving, setIsResolving] = useState(false);
  const [bust, setBust] = useState(0);
  const triedRefreshRef = useRef(false);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
    };
  }, [onWheel]);

  useEffect(() => {
    let cancelled = false;
    triedRefreshRef.current = false;
    setUnavailable(false);
    setBust(0);

    const previewContent = previewImage?.content;
    if (!previewImage || !isFileMessageContent(previewContent)) {
      setPreviewSourceUrl("");
      setIsResolving(false);
      return;
    }

    const remoteUrl = previewContent.url;
    const uploadId = previewContent.upload_id ?? null;

    // 优先从内存缓存读「已刷新」的预签名 URL，避免再次踩到旧 URL。
    const refreshed = uploadId ? getRefreshedAttachmentWeb(uploadId) : null;
    const refreshedFullUrl = refreshed?.url ?? null;

    // 桌面端：先同步查本地缓存命中再决定 <img src>，避免先闪一次过期 URL 的破图。
    if (hasDesktopMediaCache()) {
      setIsResolving(true);
      setPreviewSourceUrl("");

      window.electronAPI
        .resolveMediaCache({ remoteUrl, category: "images" })
        .then(resolved => {
          if (cancelled) return;
          if (resolved.hit) {
            setPreviewSourceUrl(resolved.record.localUrl);
            setIsResolving(false);
            return;
          }
          // 未命中：先用一个尽量「能用」的 URL（已刷新 > thumb/preview > 原图）
          // 展示，避免空白；同时触发下载，下载完成后切换到本地缓存。
          const fallback =
            pickAttachmentDisplayUri(previewContent, refreshed, null) ??
            remoteUrl;
          setPreviewSourceUrl(fallback);
          setIsResolving(false);

          window.electronAPI
            .downloadMediaCache({
              remoteUrl,
              category: "images",
              messageId:
                previewImage.server_message_id ||
                previewImage.client_message_id,
              uploadId,
              originalName: previewContent.name,
              mimeType: previewContent.mime_type ?? null,
              size: previewContent.size,
              createdAt: previewImage.created_at
            })
            .then(record => {
              if (!cancelled) {
                setPreviewSourceUrl(record.localUrl);
              }
            })
            .catch(() => {
              /* 下载失败 → 让 <img onError> 自愈接管 */
            });
        })
        .catch(() => {
          if (cancelled) return;
          setIsResolving(false);
          setPreviewSourceUrl(refreshedFullUrl ?? remoteUrl);
        });

      return () => {
        cancelled = true;
      };
    }

    // 纯 web 环境：用 refreshed 内存缓存里的最新 URL，回落到原图；onError 自愈。
    setPreviewSourceUrl(refreshedFullUrl ?? remoteUrl);

    return () => {
      cancelled = true;
    };
  }, [previewImage]);

  const handleImageError = () => {
    const previewContent = previewImage?.content;
    if (!previewImage || !isFileMessageContent(previewContent)) {
      return;
    }
    // 本地缓存 URL 加载失败属于异常，直接标记不可用，避免无意义重试。
    if (previewSourceUrl.startsWith("mushroom-media-cache://")) {
      setUnavailable(true);
      return;
    }
    const uploadId = previewContent.upload_id ?? null;
    if (!uploadId) {
      setUnavailable(true);
      return;
    }
    if (triedRefreshRef.current) {
      setUnavailable(true);
      return;
    }
    triedRefreshRef.current = true;
    void refreshAttachmentUrlsAndPersist([uploadId])
      .then(result => {
        const info = result[uploadId];
        if (!info?.url) {
          setBust(b => b + 1);
          return;
        }
        setPreviewSourceUrl(info.url);
        setBust(b => b + 1);
        setUnavailable(false);
      })
      .catch(() => {
        setUnavailable(true);
      });
  };

  const withCacheBust = (url: string) => {
    if (!bust || !url) return url;
    if (
      url.startsWith("blob:") ||
      url.startsWith("data:") ||
      url.startsWith("file:") ||
      url.startsWith("mushroom-media-cache:")
    ) {
      return url;
    }
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}__r=${bust}`;
  };

  const handleDownload = () => {
    const previewContent = previewImage?.content;
    if (!previewImage || !isFileMessageContent(previewContent)) return;
    const url = previewContent.url;
    const name = previewContent.name || "image";
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
  };

  const previewContent =
    previewImage && isFileMessageContent(previewImage.content)
      ? previewImage.content
      : null;

  return (
    <Modal
      className="im-modal im-image-preview-modal"
      open={!!previewImage}
      title={null}
      footer={null}
      closable={false}
      onCancel={onCancel}
      width="auto"
      style={{ maxWidth: "92vw", top: 0 }}
      centered
    >
      {previewImage && previewContent ? (
        <>
          {/* Toolbar */}
          <div className="im-preview-toolbar">
            <div className="im-preview-toolbar-left">
              <span className="im-preview-meta-text">
                {previewImageIndex !== null
                  ? `${previewImageIndex + 1} / ${previewImageItems.length}`
                  : null}
                {" · "}
                {formatFileSize(previewContent.size)}
                {" · "}
                {Math.round(previewZoom * 100)}%
              </span>
            </div>
            <div className="im-preview-toolbar-actions">
              <button
                className="im-preview-action-btn"
                onClick={() =>
                  onZoomChange(prev =>
                    Math.max(Number((prev - 0.25).toFixed(2)), 0.5)
                  )
                }
                title={t("chat.zoomOut")}
              >
                <ZoomOutOutlined />
              </button>
              <button
                className="im-preview-action-btn"
                onClick={() =>
                  onZoomChange(prev =>
                    Math.min(Number((prev + 0.25).toFixed(2)), 3)
                  )
                }
                title={t("chat.zoomIn")}
              >
                <ZoomInOutlined />
              </button>
              <button
                className="im-preview-action-btn"
                onClick={() => onZoomChange(1)}
                title={t("chat.zoomReset")}
              >
                <UndoOutlined />
              </button>
              <span className="im-preview-toolbar-divider" />
              <button
                className="im-preview-action-btn"
                onClick={() => {
                  window.open(
                    previewContent.url,
                    "_blank",
                    "noopener,noreferrer"
                  );
                }}
                title={t("chat.openOriginal")}
              >
                <ExpandOutlined />
              </button>
              <button
                className="im-preview-action-btn"
                onClick={handleDownload}
                title={t("chat.download")}
              >
                <DownloadOutlined />
              </button>
              <span className="im-preview-toolbar-divider" />
              <button
                className="im-preview-action-btn im-preview-close-btn"
                onClick={onCancel}
                title={t("common.close")}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Image stage */}
          <div className="im-image-preview-stage" ref={stageRef}>
            {canPreviewPrev ? (
              <button
                className="im-preview-nav-btn im-preview-nav-prev"
                onClick={onPrev}
              >
                <LeftOutlined />
              </button>
            ) : null}

            <img
              src={
                previewSourceUrl ? withCacheBust(previewSourceUrl) : undefined
              }
              alt={previewContent.name}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onError={handleImageError}
              className="im-image-preview-img"
              style={{
                transform: `translate(${previewOffset.x}px, ${previewOffset.y}px) scale(${previewZoom})`,
                cursor: previewZoom > 1 ? "grab" : "default",
                visibility:
                  isResolving || !previewSourceUrl || unavailable
                    ? "hidden"
                    : "visible"
              }}
            />

            {isResolving || (!previewSourceUrl && !unavailable) ? (
              <div className="im-image-preview-loading">
                <Spin />
              </div>
            ) : null}

            {unavailable ? (
              <div className="im-image-preview-loading">
                <span>{t("chat.imageUnavailable", "图片加载失败")}</span>
              </div>
            ) : null}

            {canPreviewNext ? (
              <button
                className="im-preview-nav-btn im-preview-nav-next"
                onClick={onNext}
              >
                <RightOutlined />
              </button>
            ) : null}
          </div>
        </>
      ) : null}
    </Modal>
  );
}
