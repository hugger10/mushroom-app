import {
  FileImageOutlined,
  FileOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  SoundOutlined,
  UploadOutlined
} from "@ant-design/icons";
import { useEffect, useRef, useState } from "react";
import { formatFileSize, type MessageFileContent } from "@mushroom/shared";
import i18next from "i18next";
import type { Message } from "../../types/chat";
import { useAttachmentProgress } from "../../hooks/attachmentProgressStore";
import { getOutboxClient } from "../../services/outbox-store";

interface PendingAttachmentBubbleProps {
  message: Message;
  previewUri?: string;
  hasError: boolean;
  errorText?: string;
  onRetry: () => void;
  /**
   * 当 content.local_source_missing === true 时由 UI 触发：弹出 file picker
   * 让用户重新选择原文件。可选；未提供时退化为普通 retry（点击 = onRetry）。
   */
  onReselect?: (file: File) => void;
}

type PreviewKind = "image" | "video" | "audio" | "file";

function inferPreviewKind(content: MessageFileContent): PreviewKind {
  const mime = (content.mime_type ?? "").toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "file";
}

function previewKindLabel(kind: PreviewKind): string {
  switch (kind) {
    case "image":
      return i18next.t("chat.attachmentCategory.image");
    case "video":
      return i18next.t("chat.attachmentCategory.video");
    case "audio":
      return i18next.t("chat.attachmentCategory.voice");
    default:
      return i18next.t("chat.attachmentCategory.file");
  }
}

function PreviewKindIcon({ kind }: { kind: PreviewKind }) {
  const style = { fontSize: 32, color: "#8c8c8c" } as const;
  switch (kind) {
    case "image":
      return <FileImageOutlined style={style} />;
    case "video":
      return <PlayCircleOutlined style={style} />;
    case "audio":
      return <SoundOutlined style={style} />;
    default:
      return <FileOutlined style={style} />;
  }
}

/**
 * 失败 / 上传中的附件消息气泡。
 *
 * 设计参考：WhatsApp、Telegram、微信 在消息流中以"半透明缩略图 + 进度环 / 重试按钮"
 * 形态呈现待上传附件；本组件确保：**一旦消息进入聊天框，气泡永远可见，不会
 * 出现"裸叉叉"**。
 *
 * 渲染优先级：
 *   1. 运行时 `previewUri`（Web 为 `blob:` URL，Mobile 为 `file://`）
 *   2. 加载失败或缺失 → 占位卡片（图标 + 文件名 + 大小 + 类别）
 *
 * 状态层（覆盖在缩略图右下角 / 中央）：
 *   - 上传中：进度百分比 + 半透明蒙层
 *   - 失败：红色 reload 按钮 + tooltip 错误文案
 *
 * 注：在线/离线文案区分（"发送失败" vs "等待网络…"）由上层在
 *     `errorText` / 后续 props 中决定，本组件只忠实渲染。
 */
export function PendingAttachmentBubble({
  message,
  previewUri,
  hasError,
  errorText,
  onRetry,
  onReselect
}: PendingAttachmentBubbleProps) {
  const progress = useAttachmentProgress(message.client_message_id) ?? 0;
  const [previewUnavailable, setPreviewUnavailable] = useState(false);
  // 进程重启 / 路由切换后，原 `blob:` URL 会失效（被 GC）；这里持有一份
  // 从 outbox 异步重建出来的 fallback blob URL，仅当 <img> onError 触发时
  // 才会去拉，避免无谓 IO。
  const [rebuiltPreviewUri, setRebuiltPreviewUri] = useState<string | null>(
    null
  );
  // useRef 持有当前生命周期里创建的 ObjectURL，卸载时 revoke 避免泄漏。
  const rebuiltUrlRef = useRef<string | null>(null);
  useEffect(() => {
    return () => {
      if (rebuiltUrlRef.current) {
        URL.revokeObjectURL(rebuiltUrlRef.current);
        rebuiltUrlRef.current = null;
      }
    };
  }, []);
  // previewUri 变化时丢弃旧 fallback（避免新 uri 与旧 fallback 串扰）。
  useEffect(() => {
    setPreviewUnavailable(false);
    setRebuiltPreviewUri(null);
    if (rebuiltUrlRef.current) {
      URL.revokeObjectURL(rebuiltUrlRef.current);
      rebuiltUrlRef.current = null;
    }
  }, [previewUri]);

  const fileContent =
    message.type === 2
      ? (message.content as unknown as MessageFileContent)
      : null;
  const localPreviewRef = fileContent?.local_preview_ref;
  const localSourceRef = fileContent?.local_source_ref;
  const sourceMissing = Boolean(
    (fileContent as { local_source_missing?: boolean } | null)
      ?.local_source_missing
  );
  const mimeAccept = (() => {
    const mime = (fileContent?.mime_type ?? "").toLowerCase();
    if (mime.startsWith("image/")) return "image/*";
    if (mime.startsWith("video/")) return "video/*";
    if (mime.startsWith("audio/")) return "audio/*";
    return "*/*";
  })();

  // 点击包装：保证任何异步抛错都不冒泡成 unhandledrejection（用户已经能从气泡
  // 上看到红色 retry 按钮，再让浏览器弹一个"Unhandled Error"窗口是冗余的）。
  const safeOnRetry = (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const ret = onRetry() as unknown;
      if (ret && typeof (ret as Promise<unknown>).catch === "function") {
        (ret as Promise<unknown>).catch(() => {
          // ignore：状态已通过 message.content.upload_error 反映到 UI。
        });
      }
    } catch {
      // ignore
    }
  };
  const triggerReselect = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onReselect) {
      safeOnRetry(e);
      return;
    }
    const input = document.createElement("input");
    input.type = "file";
    input.accept = mimeAccept;
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) {
        try {
          onReselect(file);
        } catch {
          // ignore
        }
      }
    };
    input.click();
  };

  const handleImageError = () => {
    setPreviewUnavailable(true);
    // 异步尝试从 outbox 重建：优先 preview slot（小），不行再试 source。
    // best-effort：失败就让占位卡片接管。
    const targetRef = localPreviewRef || localSourceRef;
    if (!targetRef) return;
    (async () => {
      try {
        const result = await getOutboxClient().get(targetRef);
        if (!result) return;
        const url = URL.createObjectURL(result.blob);
        if (rebuiltUrlRef.current) {
          URL.revokeObjectURL(rebuiltUrlRef.current);
        }
        rebuiltUrlRef.current = url;
        setRebuiltPreviewUri(url);
        setPreviewUnavailable(false);
      } catch {
        // ignore：保持占位卡片状态。
      }
    })();
  };

  const effectivePreviewUri = rebuiltPreviewUri || previewUri;
  const showImage = Boolean(effectivePreviewUri) && !previewUnavailable;

  const kind: PreviewKind = fileContent
    ? inferPreviewKind(fileContent)
    : "file";
  const displayName = fileContent?.name || i18next.t("chatMessage.unnamed");
  const displaySize =
    fileContent && typeof fileContent.size === "number"
      ? formatFileSize(fileContent.size)
      : "";

  return (
    <div
      className="im-pending-attachment"
      style={{
        position: "relative",
        display: "inline-block",
        width: 240,
        minHeight: 140,
        borderRadius: 8,
        overflow: "hidden",
        background: "#f0f0f0"
      }}
    >
      {showImage ? (
        <img
          src={effectivePreviewUri}
          alt=""
          onError={handleImageError}
          style={{
            display: "block",
            width: "100%",
            maxHeight: 320,
            objectFit: "cover",
            opacity: hasError ? 0.45 : 0.7
          }}
        />
      ) : (
        // 占位卡片：保证气泡始终有内容，绝不出现"裸叉叉"。
        <div
          style={{
            width: "100%",
            minHeight: 140,
            padding: 16,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            background:
              "repeating-linear-gradient(45deg, #e8e8e8 0 8px, #f0f0f0 8px 16px)",
            opacity: hasError ? 0.7 : 0.9
          }}
        >
          <PreviewKindIcon kind={kind} />
          <div
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: "#262626",
              maxWidth: 200,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              textAlign: "center"
            }}
            title={displayName}
          >
            {previewKindLabel(kind)} · {displayName}
          </div>
          {displaySize ? (
            <div style={{ fontSize: 11, color: "#8c8c8c" }}>{displaySize}</div>
          ) : null}
        </div>
      )}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 4,
          color: "#fff",
          textShadow: "0 1px 2px rgba(0,0,0,0.5)",
          background: showImage ? "rgba(0,0,0,0.15)" : "transparent",
          pointerEvents: "none"
        }}
      >
        {hasError ? (
          sourceMissing ? (
            <button
              type="button"
              onClick={triggerReselect}
              title={i18next.t("chat.attachmentLocalSourceLost")}
              style={{
                background: "rgba(245,158,11,0.95)",
                color: "#fff",
                border: "none",
                borderRadius: 18,
                padding: "6px 12px",
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                pointerEvents: "auto"
              }}
            >
              <UploadOutlined style={{ fontSize: 14 }} />
              {i18next.t("chat.reselectAttachment")}
            </button>
          ) : (
            <button
              type="button"
              onClick={safeOnRetry}
              title={errorText || ""}
              style={{
                background: "rgba(220,38,38,0.92)",
                color: "#fff",
                border: "none",
                borderRadius: "50%",
                width: 40,
                height: 40,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                pointerEvents: "auto"
              }}
            >
              <ReloadOutlined style={{ fontSize: 20 }} />
            </button>
          )
        ) : showImage ? (
          <span style={{ fontSize: 14, fontWeight: 600 }}>{progress}%</span>
        ) : (
          // 占位卡片上的进度展示更柔和，避免与文件名重叠。
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "#595959",
              textShadow: "none",
              background: "rgba(255,255,255,0.85)",
              padding: "2px 8px",
              borderRadius: 10,
              position: "absolute",
              bottom: 8,
              right: 8
            }}
          >
            {progress}%
          </span>
        )}
      </div>
    </div>
  );
}
