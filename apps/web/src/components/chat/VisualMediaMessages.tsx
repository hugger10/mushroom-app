import { useEffect, useState, type CSSProperties } from "react";
import type { MessageFileContent } from "@mushroom/shared";
import { computeImageBubbleSize, getMediaAspectRatio } from "@mushroom/shared";
import type { Message } from "../../types/chat";
import {
  buildMediaCachePayload,
  hasDesktopMediaCache,
  useCachedMediaUrl
} from "./messageMediaCache";
import { useAttachmentDisplayUrl } from "../../hooks/useAttachmentDisplayUrl";

export function CachedImageMessage(props: {
  username: string;
  message: Message;
  content: MessageFileContent;
  onClick: () => void;
}) {
  // 图片消息优先展示服务端异步生成的 preview_url（长边 1280），
  // 在 preview 尚未就绪时回退到 thumb_url，最后才下载原图。
  const previewSource =
    props.content.preview_url || props.content.thumb_url || props.content.url;
  const cachedUrl = useCachedMediaUrl({
    username: props.username,
    message: props.message,
    content: { ...props.content, url: previewSource },
    category: "images"
  });
  const isPending = props.content.thumb_status === "pending";

  // useAttachmentDisplayUrl 负责 preview/thumb/url 回退以及 onError 自愈；
  // 仅当 useCachedMediaUrl 返回真正的本地协议 URL 时才作为最高优先级传入，
  // 避免远端 URL 绕过 hook 的 cache-bust 自愈链路。
  const localCacheUrl =
    cachedUrl !== previewSource &&
    (cachedUrl.startsWith("file:") ||
      cachedUrl.startsWith("blob:") ||
      cachedUrl.startsWith("data:"))
      ? cachedUrl
      : null;
  const { src, unavailable, onError } = useAttachmentDisplayUrl(props.content, {
    localCacheUrl
  });

  // 让气泡完全贴合真实图片像素：根据 content.width/height（服务端缩略图
  // worker 写入）计算目标显示尺寸，避免 letterbox 留白导致时间戳 chip
  // 落在空白区。缺失尺寸时使用 4:3 fallback，<img> 加载完成后再用
  // naturalWidth/Height 触发一次精确重算。
  // useState 必须在条件性 return 之前调用，保证 hooks 顺序稳定。
  const [naturalSize, setNaturalSize] = useState<{
    width: number;
    height: number;
  } | null>(null);

  if (unavailable || !src) {
    return (
      <button
        className="im-media-message-button"
        type="button"
        onClick={props.onClick}
        aria-label={props.content.name}
      />
    );
  }

  const hasIntrinsic = Boolean(props.content.width && props.content.height);
  const sizingInput = hasIntrinsic
    ? { width: props.content.width, height: props.content.height }
    : (naturalSize ?? { width: undefined, height: undefined });
  const sized = computeImageBubbleSize(sizingInput);

  const buttonStyle: CSSProperties = {
    width: sized.width,
    height: sized.height
  };
  const imgStyle: CSSProperties = {
    width: "100%",
    height: "100%"
  };
  if (isPending) {
    imgStyle.opacity = 0.6;
  }

  return (
    <button
      className="im-media-message-button"
      type="button"
      onClick={props.onClick}
      style={buttonStyle}
    >
      <img
        className="im-media-message-image"
        src={src}
        alt={props.content.name}
        style={imgStyle}
        onError={onError}
        onLoad={
          hasIntrinsic
            ? undefined
            : event => {
                const img = event.currentTarget;
                if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                  setNaturalSize({
                    width: img.naturalWidth,
                    height: img.naturalHeight
                  });
                }
              }
        }
      />
    </button>
  );
}

export function CachedVideoMessage(props: {
  username: string;
  message: Message;
  content: MessageFileContent;
  onOpen: (args: { url: string; uploadId?: string }) => void;
}) {
  const [isOpening, setIsOpening] = useState(false);
  const [cachedUrl, setCachedUrl] = useState<string | null>(null);

  // Resolve local cache on mount (read-only, no download triggered).
  // If the video was previously downloaded, use the local URL for the
  // thumbnail so it works offline.
  useEffect(() => {
    let cancelled = false;
    if (!hasDesktopMediaCache()) {
      return;
    }

    window.electronAPI
      .resolveMediaCache({
        remoteUrl: props.content.url,
        category: "video"
      })
      .then(resolved => {
        if (!cancelled && resolved.hit) {
          setCachedUrl(resolved.record.localUrl);
        }
      })
      .catch(() => {
        /* ignore – will fall back to remote URL */
      });

    return () => {
      cancelled = true;
    };
  }, [props.username, props.content.url]);

  async function handleOpenVideo() {
    if (isOpening) {
      return;
    }

    if (!hasDesktopMediaCache()) {
      props.onOpen({
        url: props.content.url,
        uploadId: props.content.upload_id
      });
      return;
    }

    // If we already resolved a local cache entry, use it directly.
    if (cachedUrl) {
      props.onOpen({ url: cachedUrl, uploadId: props.content.upload_id });
      return;
    }

    setIsOpening(true);
    try {
      const record = await window.electronAPI.downloadMediaCache(
        buildMediaCachePayload({
          message: props.message,
          content: props.content,
          category: "video"
        })
      );
      setCachedUrl(record.localUrl);
      props.onOpen({ url: record.localUrl, uploadId: props.content.upload_id });
    } catch {
      props.onOpen({
        url: props.content.url,
        uploadId: props.content.upload_id
      });
    } finally {
      setIsOpening(false);
    }
  }

  // 视频气泡同样按 aspect-ratio 占位；视频缺失尺寸时使用 4/3（与现有 320×240 一致）。
  const videoAspectRatio = getMediaAspectRatio(props.content);
  const mediaStyle: CSSProperties = { aspectRatio: videoAspectRatio };

  return (
    <button
      className="im-media-message-button im-video-message-button"
      type="button"
      onClick={() => void handleOpenVideo()}
      disabled={isOpening}
      style={mediaStyle}
    >
      {props.content.thumb_url ? (
        <VideoThumbImage
          uploadId={
            props.content.thumbnail_upload_id ?? props.content.upload_id
          }
          src={props.content.thumb_url}
          name={props.content.name}
          style={mediaStyle}
        />
      ) : (
        // 无封面时只渲染灰底占位（外层 ▶ 图标已提供视觉指示）。
        // 不再用 <video preload="metadata"> 拉整段 mp4 当封面，避免：
        // 1) 预签名 URL 过期导致黑框 + 控制台 403；
        // 2) 浏览器为取一帧 metadata 而拉整段视频的流量浪费。
        // 注意：用 <div> 而非 <span>，并显式给定宽度——否则空的 inline 元素
        // 不会撑开父按钮，导致整个气泡视觉消失。
        <div
          className="im-media-message-video im-media-message-video-placeholder"
          aria-hidden="true"
          style={mediaStyle}
        />
      )}
      <span className="im-video-play-icon" aria-hidden="true">
        {isOpening ? "…" : "▶"}
      </span>
    </button>
  );
}

function VideoThumbImage(props: {
  uploadId: string | undefined;
  src: string;
  name: string;
  style?: CSSProperties;
}) {
  // 视频封面也走统一 hook：URL 过期时 onError → refresh-urls 自愈。
  // 这里没有 MessageFileContent 完整对象，构造一个最小子集即可：URL
  // 解析器只读取 url/thumb_url/preview_url/upload_id。
  const { src, unavailable, onError } = useAttachmentDisplayUrl({
    url: props.src,
    thumb_url: props.src,
    upload_id: props.uploadId
  });
  if (unavailable || !src) {
    return (
      <span
        className="im-media-message-video"
        aria-label={props.name}
        style={props.style}
      />
    );
  }
  return (
    <img
      className="im-media-message-video"
      src={src}
      alt={props.name}
      onError={onError}
      style={props.style}
    />
  );
}
