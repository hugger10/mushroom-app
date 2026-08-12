import { useCallback, useRef, useState } from "react";
import type {
  MobileMessageSearchFilter,
  MobileMessageSearchResult
} from "@mushroom/app-core";
import type { MessageFileContent, UserPresenceSummary } from "@mushroom/shared";
import type { PickedMediaAsset } from "../../../platform/native-pickers";

export type BatchForwardMode = "one-by-one" | "merged";

/**
 * 大图预览所需的最小附件元数据。
 * `upload_id` 用于 `<Image onError>` 触发 `refresh-urls` 自愈；
 * `url/thumb_url/preview_url` 用于 `pickAttachmentDisplayUri` 兜底链。
 * `message_id` 用于自愈成功后回写 SQLite，与桌面端持久化行为对齐。
 */
export type PreviewImageContent = Pick<
  MessageFileContent,
  "upload_id" | "url" | "thumb_url" | "preview_url" | "local_preview_uri"
> & { message_id?: string | null };

export type PreviewImageItem = {
  url: string | null;
  content: PreviewImageContent;
};

export function useChatInteractionState() {
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null);
  const [composerText, setComposerText] = useState("");
  const [composerToolsVisible, setComposerToolsVisible] = useState(false);
  /** "原图"开关：每次发送后由 action 重置。 */
  const [sendImageAsOriginal, setSendImageAsOriginal] = useState(false);
  /**
   * 用户从相册/相机刚刚挑选好、等待在预览页确认发送的图片/视频。
   * 与 `imagePreviewVisible` 一起驱动 `ImageSendPreview` 组件。
   * 对齐微信"选完图先进入预览页 → 勾选原图 → 点发送"的体验。
   */
  const [pendingImageAsset, setPendingImageAsset] =
    useState<PickedMediaAsset | null>(null);
  const [imagePreviewVisible, setImagePreviewVisible] = useState(false);
  /**
   * 预览页发送按钮位置：短视频录制后预览走右上角发送（对齐微信）；
   * 相册 / 系统相机选图仍走底部发送。
   */
  const [imagePreviewSendTopRight, setImagePreviewSendTopRight] =
    useState(false);
  const [replyTargetId, setReplyTargetId] = useState<string | null>(null);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(
    null
  );
  const [forwardingMessageId, setForwardingMessageId] = useState<string | null>(
    null
  );
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [multiSelectedIds, setMultiSelectedIds] = useState<Set<string>>(
    new Set()
  );
  const [batchForwardMode, setBatchForwardMode] =
    useState<BatchForwardMode | null>(null);
  const [previewImageList, setPreviewImageList] = useState<
    PreviewImageItem[] | null
  >(null);
  const [previewImageIndex, setPreviewImageIndex] = useState(0);
  const [previewKey, setPreviewKey] = useState(0);
  const [previewVideo, setPreviewVideo] = useState<{
    uri: string;
    uploadId?: string | null;
    messageId?: string | null;
  } | null>(null);
  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [searchFilter, setSearchFilter] =
    useState<MobileMessageSearchFilter>("all");
  const [searchResults, setSearchResults] = useState<
    MobileMessageSearchResult[]
  >([]);
  /** 当前会话的置顶消息列表（来自 searchMessages(filter: "pinned")）。 */
  const [pinnedMessages, setPinnedMessages] = useState<
    MobileMessageSearchResult[]
  >([]);
  /** 置顶消息列表面板（PinnedMessagesSheet）是否可见。 */
  const [pinnedMessagesVisible, setPinnedMessagesVisible] = useState(false);
  /**
   * 置顶列表强制刷新 nonce：置顶/取消置顶成功后自增，让加载 effect 跳过
   * 「置顶签名」增量判断直接重新查询。窗口外的置顶消息被取消置顶时，
   * activeMessages 不会变化（签名不变），必须靠这里显式触发刷新。
   */
  const [pinnedRefreshNonce, setPinnedRefreshNonce] = useState(0);
  const bumpPinnedRefresh = () => setPinnedRefreshNonce(n => n + 1);
  const [highlightedMessageId, setHighlightedMessageId] = useState<
    string | null
  >(null);
  // 单调递增的"高亮请求 nonce"。每次 onSearchPrev/Next 触发都自增，
  // 让搜索定位的 effect 即使在 highlightedMessageId 未变（边界重按）时
  // 也能重新触发滚动定位。
  const [highlightRequestNonce, setHighlightRequestNonce] = useState(0);
  const bumpHighlightRequestNonce = () => setHighlightRequestNonce(n => n + 1);
  const [isSearchNavigating, setIsSearchNavigating] = useState(false);
  const [userPresenceByUserId, setUserPresenceByUserId] = useState<
    Record<number, UserPresenceSummary>
  >({});
  const [typingConversationId, setTypingConversationId] = useState<
    string | null
  >(null);
  const [peerTypingActivity, setPeerTypingActivity] = useState<
    "text" | "voice" | null
  >(null);
  /**
   * Group-aware multi-typer state: per conversation, a map of sender userId
   * to current activity. Driven by `typing` ws frames after server fan-out.
   * 1:1 typers also land here so callers can render a unified subtitle.
   */
  const [typersByConversationId, setTypersByConversationId] = useState<
    Record<string, Record<number, { activity: "text" | "voice" }>>
  >({});
  const [voiceRecordingActive, setVoiceRecordingActive] = useState(false);
  const [cameraOverlayVisible, setCameraOverlayVisible] = useState(false);
  const [voicePlayingMessageId, setVoicePlayingMessageId] = useState<
    string | null
  >(null);
  const [voicePlayingPositionMs, setVoicePlayingPositionMs] = useState(0);
  const [loadingOlderConversationId, setLoadingOlderConversationId] = useState<
    string | null
  >(null);
  const voiceMeteringSamplesRef = useRef<number[]>([]);
  const typingIndicatorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  /**
   * Per-(conversation, sender) idle timers that hide a typer when the
   * server-side `active=false` frame is dropped on the wire. Keyed as
   * `${conversationId}:${senderUserId}`.
   */
  const typersIdleTimersRef = useRef<
    Record<string, ReturnType<typeof setTimeout>>
  >({});
  const typingSignalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const lastTypingSignalKeyRef = useRef("");

  function enterMultiSelectMode(initialMessageId?: string) {
    setIsMultiSelectMode(true);
    setMultiSelectedIds(
      initialMessageId ? new Set([initialMessageId]) : new Set()
    );
    setBatchForwardMode(null);
    setSelectedMessageId(null);
  }

  function exitMultiSelectMode() {
    setIsMultiSelectMode(false);
    setMultiSelectedIds(new Set());
    setBatchForwardMode(null);
  }

  function toggleMultiSelectMessage(messageId: string) {
    setMultiSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      return next;
    });
  }

  /**
   * 打开大图预览的统一入口。接收完整的图片列表和初始索引。
   */
  const openImagePreviewList = useCallback(
    (images: PreviewImageItem[], startIndex: number) => {
      const clamped = Math.max(0, Math.min(startIndex, images.length - 1));
      previewGenerationRef.current += 1;
      setPreviewKey(prev => prev + 1);
      setPreviewImageList(images);
      previewImageListRef.current = images;
      setPreviewImageIndex(clamped);
    },
    []
  );

  /**
   * 更新列表中指定索引的图片 URL（用于异步 URL 解析完成后回填）。
   */
  const updatePreviewImageUrl = useCallback(
    (index: number, url: string | null) => {
      setPreviewImageList(prev => {
        if (!prev || index < 0 || index >= prev.length) return prev;
        const next = [...prev];
        next[index] = { ...next[index], url };
        return next;
      });
    },
    []
  );

  const previewGenerationRef = useRef(0);

  const previewImageListRef = useRef<PreviewImageItem[] | null>(null);
  previewImageListRef.current = previewImageList;

  const clearPreviewImage = useCallback(() => {
    setPreviewImageList(null);
    previewImageListRef.current = null;
    setPreviewImageIndex(0);
    previewGenerationRef.current += 1;
  }, []);

  const navigatePreviewImage = useCallback((direction: -1 | 1) => {
    setPreviewImageIndex(prev => {
      const next = prev + direction;
      const list = previewImageListRef.current;
      if (!list || next < 0 || next >= list.length) return prev;
      return next;
    });
  }, []);

  return {
    activeConversationId,
    setActiveConversationId,
    composerText,
    setComposerText,
    composerToolsVisible,
    setComposerToolsVisible,
    sendImageAsOriginal,
    setSendImageAsOriginal,
    pendingImageAsset,
    setPendingImageAsset,
    imagePreviewVisible,
    setImagePreviewVisible,
    imagePreviewSendTopRight,
    setImagePreviewSendTopRight,
    replyTargetId,
    setReplyTargetId,
    selectedMessageId,
    setSelectedMessageId,
    forwardingMessageId,
    setForwardingMessageId,
    isMultiSelectMode,
    multiSelectedIds,
    batchForwardMode,
    setBatchForwardMode,
    enterMultiSelectMode,
    exitMultiSelectMode,
    toggleMultiSelectMessage,
    previewKey,
    previewImageList,
    previewImageIndex,
    openImagePreviewList,
    updatePreviewImageUrl,
    clearPreviewImage,
    navigatePreviewImage,
    previewGenerationRef,
    previewVideo,
    setPreviewVideo,
    isSearchVisible,
    setIsSearchVisible,
    searchKeyword,
    setSearchKeyword,
    searchFilter,
    setSearchFilter,
    searchResults,
    setSearchResults,
    pinnedMessages,
    setPinnedMessages,
    pinnedMessagesVisible,
    setPinnedMessagesVisible,
    pinnedRefreshNonce,
    bumpPinnedRefresh,
    highlightedMessageId,
    setHighlightedMessageId,
    highlightRequestNonce,
    bumpHighlightRequestNonce,
    isSearchNavigating,
    setIsSearchNavigating,
    userPresenceByUserId,
    setUserPresenceByUserId,
    typingConversationId,
    setTypingConversationId,
    peerTypingActivity,
    setPeerTypingActivity,
    typersByConversationId,
    setTypersByConversationId,
    voiceRecordingActive,
    setVoiceRecordingActive,
    cameraOverlayVisible,
    setCameraOverlayVisible,
    voicePlayingMessageId,
    setVoicePlayingMessageId,
    voicePlayingPositionMs,
    setVoicePlayingPositionMs,
    loadingOlderConversationId,
    setLoadingOlderConversationId,
    voiceMeteringSamplesRef,
    typingIndicatorTimerRef,
    typersIdleTimersRef,
    typingSignalTimerRef,
    lastTypingSignalKeyRef
  };
}
