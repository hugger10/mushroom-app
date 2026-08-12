import { Modal } from "antd";
import { DownloadOutlined } from "@ant-design/icons";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { refreshAttachmentUrlsAndPersist } from "../../http/refreshAttachmentUrls";

interface VideoPlayerModalProps {
  url: string | null;
  /**
   * 关联的附件 upload_id。当远端预签名 URL 过期导致 <video> onError 时，
   * 用它去 `POST /file/attachment/refresh-urls` 拿新 URL 重试一次。
   * file:// / blob: 等本地 URL 没有 uploadId 也无需自愈。
   */
  uploadId?: string | null;
  onClose: () => void;
}

function isLocalUrl(url: string) {
  return (
    url.startsWith("file:") ||
    url.startsWith("blob:") ||
    url.startsWith("data:")
  );
}

export function VideoPlayerModal({
  url,
  uploadId,
  onClose
}: VideoPlayerModalProps) {
  const { t } = useTranslation();
  const [currentSrc, setCurrentSrc] = useState<string | null>(url);
  const [errored, setErrored] = useState(false);
  const triedRef = useRef(false);

  // url / uploadId 变化时重置自愈状态。
  useEffect(() => {
    setCurrentSrc(url);
    setErrored(false);
    triedRef.current = false;
  }, [url, uploadId]);

  async function refreshOnce(): Promise<string | null> {
    if (!uploadId) return null;
    try {
      const result = await refreshAttachmentUrlsAndPersist([uploadId]);
      return result[uploadId]?.url ?? null;
    } catch {
      return null;
    }
  }

  function handleVideoError() {
    if (!currentSrc) return;
    // 本地 URL 失败一般是文件被删；不走刷新逻辑。
    if (isLocalUrl(currentSrc) || !uploadId || triedRef.current) {
      setErrored(true);
      return;
    }
    triedRef.current = true;
    void refreshOnce().then(next => {
      if (next) {
        setCurrentSrc(next);
        setErrored(false);
      } else {
        setErrored(true);
      }
    });
  }

  function handleRetry() {
    // 用户主动重试：清重试标记，重新尝试刷新一次。
    triedRef.current = false;
    setErrored(false);
    void refreshOnce().then(next => {
      if (next) {
        setCurrentSrc(next);
      } else {
        setErrored(true);
      }
    });
  }

  const handleDownload = async () => {
    if (!currentSrc) return;
    try {
      const res = await fetch(currentSrc);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = "video";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
      return;
    } catch {
      // fall through to refresh + retry
    }
    if (uploadId && !isLocalUrl(currentSrc)) {
      const next = await refreshOnce();
      if (next) {
        try {
          const res = await fetch(next);
          if (res.ok) {
            const blob = await res.blob();
            const blobUrl = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = blobUrl;
            link.download = "video";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(blobUrl);
            setCurrentSrc(next);
            return;
          }
        } catch {
          /* ignore */
        }
      }
    }
    // 最终兜底：在新标签打开（可能仍失败，但保持原行为）。
    window.open(currentSrc, "_blank", "noopener,noreferrer");
  };

  return (
    <Modal
      className="im-modal im-video-player-modal"
      open={!!url}
      title={null}
      footer={null}
      closable={false}
      onCancel={onClose}
      width="80vw"
      style={{ maxWidth: 960, top: 0 }}
      centered
      destroyOnHidden
    >
      <div className="im-preview-toolbar">
        <div className="im-preview-toolbar-left" />
        <div className="im-preview-toolbar-actions">
          <button
            className="im-preview-action-btn"
            onClick={() => void handleDownload()}
            title={t("chat.download")}
          >
            <DownloadOutlined />
          </button>
          <span className="im-preview-toolbar-divider" />
          <button
            className="im-preview-action-btn im-preview-close-btn"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
      </div>
      {currentSrc && !errored ? (
        <video
          className="im-video-player-video"
          src={currentSrc}
          controls
          autoPlay
          onError={handleVideoError}
        />
      ) : null}
      {errored ? (
        <div className="im-video-player-error">
          <div className="im-video-player-error-text">
            {t("chat.videoUnavailable", "视频已失效")}
          </div>
          <button
            className="im-preview-action-btn"
            type="button"
            onClick={handleRetry}
          >
            {t("chat.retry", "重试")}
          </button>
        </div>
      ) : null}
    </Modal>
  );
}
