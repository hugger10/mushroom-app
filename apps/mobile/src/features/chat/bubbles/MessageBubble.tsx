import { memo, useEffect, useMemo, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  getOutgoingFailureDisplayText,
  isRetryableOutgoingError,
  type ContactListItem,
  type Conversation,
  type LoginUser,
  getMessageSummaryText,
  getSystemMessageText,
  isFileMessageContent,
  isMergedForwardContent,
  isSystemMessageContent,
  type Message,
  type MessageFileContent,
  type VoiceFileMessageContent,
  computeImageBubbleSize
} from "@mushroom/shared";
import {
  Animated,
  Keyboard,
  Pressable,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  withRepeat,
  interpolate
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { scheduleOnRN } from "react-native-worklets";
import Ionicons from "react-native-vector-icons/Ionicons";
import Lucide from "@react-native-vector-icons/lucide/static";
import type { MessageMenuAnchor } from "../MessageContextMenu";
import { useAppTheme } from "../../../styles/app-styles";
import { colorFromSeed } from "../../../styles/theme";
import {
  getMessageSenderDisplayName,
  getMessageSenderAvatar,
  isSystemTimelineMessage
} from "../../../utils/display";
import { formatConversationTime } from "../../../utils/app-ui";
import { AppAvatar } from "../../../components/ui";
import { useNetworkType } from "../../../platform/network-type";
import { useMediaAutoDownloadPreferences } from "../../storage";
import { MergedForwardCard } from "../MergedForwardCard";
import { MessageReactionBar } from "../MessageReactionBar";
import { BubbleMetaRow } from "./parts/BubbleMetaRow";
import { PendingAttachmentBubble } from "./parts/PendingAttachmentBubble";
import { ReplyPreviewBlock } from "./parts/ReplyPreviewBlock";
import { VoiceBubbleContent } from "./parts/VoiceBubbleContent";
import { ImageBubbleContent } from "./parts/ImageBubbleContent";
import { VideoBubbleContent } from "./parts/VideoBubbleContent";
import { AudioBubbleContent } from "./parts/AudioBubbleContent";
import { FileBubbleContent } from "./parts/FileBubbleContent";
import { TextBubbleContent } from "./parts/TextBubbleContent";
import { SystemTimelineRow } from "./parts/SystemTimelineRow";
import { MultiSelectCheckbox } from "./parts/MultiSelectCheckbox";
import { useBubbleLongPress } from "./hooks/useBubbleLongPress";
import { useResolvedMessageContents } from "./hooks/useResolvedMessageContents";
import { useImageCache } from "./hooks/useImageCache";
import { useFileCache } from "./hooks/useFileCache";
import { useVideoPreviewCache } from "./hooks/useVideoPreviewCache";
import { useVoicePrefetch } from "./hooks/useVoicePrefetch";
import { hapticHeavy } from "../../../platform/haptics";

export const MessageBubble = memo(function MessageBubble(props: {
  message: Message;
  conversation: Conversation;
  isOwn: boolean;
  peerLastReadSequence: number;
  peerHasRead?: boolean;
  showReadReceipt?: boolean;
  selected: boolean;
  highlighted: boolean;
  /** 单调递增；即使 highlighted 未变（2s 内重复跳转同一引用），也重播闪烁动画。 */
  highlightRequestNonce?: number;
  searchActive?: boolean;
  searchKeyword?: string;
  contacts?: ContactListItem[];
  loginUser?: LoginUser | null;
  /** message-taking 版本回调，由 MessageBubble 内部 useCallback 绑定，确保传给子组件的引用稳定。 */
  onSelectMessage?: (message: Message) => void;
  onLongPress?: (message: Message, anchor: MessageMenuAnchor) => void;
  onMemberAvatarPress?: (
    senderId: number,
    senderName: string,
    senderAvatar: string | null
  ) => void;
  onMemberAvatarLongPress?: (
    senderId: number,
    senderName: string,
    senderAvatar: string | null
  ) => void;
  onPreviewImageMessage?: (message: Message) => void;
  onPreviewVideoMessage?: (message: Message) => void;
  onOpenAttachmentMessage?: (message: Message) => void;
  onToggleVoicePlaybackMessage?: (message: Message) => void;
  voicePlaying: boolean;
  voicePlayingPositionMs: number;
  isMultiSelectMode?: boolean;
  isMultiSelected?: boolean;
  onMultiSelectToggle?: () => void;
  onOpenMergedForward?: (message: Message) => void;
  onToggleReaction?: (message: Message, emoji: string) => void;
  /**
   * 失败附件气泡的"重试"按钮触发。仅在 status=-1 且 content.upload_error
   * 或 upload_pending=true（极端崩溃残留）时显示。
   */
  onRetryAttachment?: (message: Message) => void;
  /** 失败附件 + 本地源丢失时点击"重新选择文件"。 */
  onReselectAttachment?: (message: Message) => void;
  onOpenReactionDetail?: (message: Message) => void;
  onJumpToReply?: (serverMessageId: string) => void;
  onReply?: (message: Message) => void;
}) {
  const { t } = useTranslation();
  const { styles, theme } = useAppTheme();
  const networkType = useNetworkType();
  const { preferences: autoDownloadPreferences } =
    useMediaAutoDownloadPreferences();
  const senderDisplayName = getMessageSenderDisplayName({
    message: props.message,
    conversation: props.conversation,
    contacts: props.contacts,
    loginUser: props.loginUser
  });
  const bubbleStyle = props.isOwn ? styles.bubbleOwn : styles.bubbleOther;
  const textStyle = props.isOwn ? styles.bubbleTextOwn : styles.bubbleTextOther;
  const inlineMetaStyle = props.isOwn
    ? styles.bubbleMetaInlineOwn
    : styles.bubbleMetaInlineOther;
  const receiptColor = props.isOwn
    ? theme.colors.accent
    : styles.bubbleMetaOther.color;
  const containerStyle = props.isOwn
    ? styles.messageRowOwn
    : styles.messageRowOther;

  // 稳定回调引用: 将 message-taking 版本的回调绑定到当前 message，
  // 确保传给子组件（ImageBubbleContent 等）的引用跨渲染稳定，
  // 让 React.memo 能正确跳过无变化的消息气泡。
  const handlePress = useCallback(
    () => props.onSelectMessage?.(props.message),
    [props.onSelectMessage, props.message]
  );
  const handlePreviewImage = useCallback(() => {
    Keyboard.dismiss();
    props.onPreviewImageMessage?.(props.message);
  }, [props.onPreviewImageMessage, props.message]);
  const handlePreviewVideo = useCallback(() => {
    Keyboard.dismiss();
    props.onPreviewVideoMessage?.(props.message);
  }, [props.onPreviewVideoMessage, props.message]);
  const handleOpenAttachment = useCallback(
    () => props.onOpenAttachmentMessage?.(props.message),
    [props.onOpenAttachmentMessage, props.message]
  );
  const handleToggleVoicePlayback = useCallback(
    () => props.onToggleVoicePlaybackMessage?.(props.message),
    [props.onToggleVoicePlaybackMessage, props.message]
  );
  const handleOpenMergedForward = useCallback(
    () => props.onOpenMergedForward?.(props.message),
    [props.onOpenMergedForward, props.message]
  );
  const handleToggleReaction = useCallback(
    (emoji: string) => props.onToggleReaction?.(props.message, emoji),
    [props.onToggleReaction, props.message]
  );
  const handleOpenReactionDetail = useCallback(
    () => props.onOpenReactionDetail?.(props.message),
    [props.onOpenReactionDetail, props.message]
  );
  const handleJumpToReply = useCallback(
    (serverMessageId: string) => props.onJumpToReply?.(serverMessageId),
    [props.onJumpToReply]
  );

  const avatarColor = useMemo(
    () =>
      colorFromSeed(
        senderDisplayName || String(props.message.sender_id || "user"),
        theme.avatarPalette
      ),
    [
      senderDisplayName,
      props.conversation,
      props.contacts,
      props.loginUser,
      props.message.sender_id,
      theme.avatarPalette
    ]
  );
  const senderAvatar = getMessageSenderAvatar({
    message: props.message,
    conversation: props.conversation,
    contacts: props.contacts,
    loginUser: props.loginUser
  });
  let voiceContent: VoiceFileMessageContent | null = null;
  let imageContent: MessageFileContent | null = null;
  let videoContent: MessageFileContent | null = null;
  let audioContent: MessageFileContent | null = null;
  let genericFileContent: MessageFileContent | null = null;
  const cacheUsername = props.loginUser?.username ?? "unknown";

  const resolved = useResolvedMessageContents(props.message);
  voiceContent = resolved.voice;
  imageContent = resolved.image;
  videoContent = resolved.video;
  audioContent = resolved.audio;
  genericFileContent = resolved.generic;
  let genericContent = genericFileContent as MessageFileContent | null;
  let videoPreviewContent = videoContent as MessageFileContent | null;
  const voiceAutoContent = voiceContent as VoiceFileMessageContent | null;

  // 附件上传中 / 失败：以本地预览 + 进度 / 重试按钮的形式渲染气泡，
  // 短路掉常规附件渲染分支（与桌面端 PendingAttachmentBubble 行为一致）。
  const attachmentFileContent: MessageFileContent | null =
    resolved.pendingContent;
  const isPendingAttachment = resolved.isPendingAttachment;
  if (isPendingAttachment) {
    imageContent = null;
    videoContent = null;
    audioContent = null;
    genericFileContent = null;
    genericContent = null;
    videoPreviewContent = null;
  }

  const text = props.message.is_recalled
    ? t("systemMessage.messageRecalled")
    : isSystemMessageContent(props.message.content)
      ? getSystemMessageText(props.message.content, t)
      : getMessageSummaryText(props.message.content, t);
  const isSystemMessage = isSystemTimelineMessage(props.message);
  const failureLabel =
    props.message.status === -1
      ? isRetryableOutgoingError(props.message.last_error)
        ? t("chatMessage.sendFailed")
        : getOutgoingFailureDisplayText(props.message.last_error, t)
      : null;
  const isBlockedFailure =
    props.message.status === -1 &&
    !isRetryableOutgoingError(props.message.last_error);

  const metaText: string | null = null;
  const timeText = formatConversationTime(props.message.created_at);
  const isRead =
    props.peerHasRead ??
    Number(props.peerLastReadSequence || 0) >=
      Number(props.message.sequence || 0);
  const isMergedForwardMessage =
    isMergedForwardContent(props.message.content) && !props.message.is_recalled;
  const rendersTextMessage =
    props.message.is_recalled ||
    (!isFileMessageContent(props.message.content) && !isMergedForwardMessage);
  const isMediaMessage =
    !props.message.is_recalled &&
    (imageContent !== null || videoContent !== null);
  // 图片：根据真实像素尺寸决定是否使用 overlay chip；过小图退化到下方。
  // 视频：始终 overlay（有播放按钮居中覆盖，下方留时间戳会显得割裂）。
  const mediaUsesOverlay = (() => {
    if (!isMediaMessage) return false;
    if (videoContent !== null) return true;
    if (imageContent !== null) {
      const sized = computeImageBubbleSize({
        width: imageContent.width,
        height: imageContent.height
      });
      return !sized.useExternalFooter;
    }
    return true;
  })();
  const isVoiceMessage = voiceContent !== null && !props.message.is_recalled;
  const inlineMetaLabel = `${timeText}${metaText ? ` · ${metaText}` : ""}`;
  const showInlineReceipt =
    props.isOwn &&
    props.message.status !== -1 &&
    props.showReadReceipt !== false;
  const { imageCacheUri } = useImageCache({
    content: imageContent,
    message: props.message,
    cacheUsername,
    isRecalled: !!props.message.is_recalled,
    networkType,
    policy: autoDownloadPreferences.photos
  });
  const { fileCacheState } = useFileCache({
    content: genericContent,
    message: props.message,
    cacheUsername,
    isRecalled: !!props.message.is_recalled,
    networkType,
    policy: autoDownloadPreferences.documents
  });
  // 视频附件按策略后台预下载（不再用于封面预览，仅触发副作用）。
  useVideoPreviewCache({
    content: videoPreviewContent,
    message: props.message,
    cacheUsername,
    isRecalled: !!props.message.is_recalled,
    networkType,
    policy: autoDownloadPreferences.videos
  });
  useVoicePrefetch({
    content: voiceAutoContent,
    message: props.message,
    cacheUsername,
    isRecalled: !!props.message.is_recalled,
    networkType,
    policy: autoDownloadPreferences.audio
  });
  const bubbleRef = useRef<View>(null);
  const { scaleAnim, handleLongPress } = useBubbleLongPress({
    message: props.message,
    onLongPress: props.onLongPress,
    onPress: handlePress
  });

  // 引用/搜索跳转后原始气泡的橙色闪烁：气泡胶囊蒙层透明度 0→1→0 快速闪烁
  // 3 次，随后归零恢复原样（2s 后上游清除 highlightedMessageId 前即结束）。
  const highlightOpacity = useSharedValue(0);
  useEffect(() => {
    if (!props.highlighted) {
      highlightOpacity.value = 0;
      return;
    }
    highlightOpacity.value = 0;
    highlightOpacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 130 }),
        withTiming(0, { duration: 130 })
      ),
      3,
      false,
      finished => {
        if (finished) {
          highlightOpacity.value = 0;
        }
      }
    );
  }, [props.highlighted, props.highlightRequestNonce, highlightOpacity]);
  const bubbleHighlightStyle = useAnimatedStyle(() => ({
    opacity: highlightOpacity.value
  }));

  const SWIPE_THRESHOLD = 50;
  const MAX_SHIFT = 120;
  const ICON_FADE_DISTANCE = 60;

  const swipeTranslateX = useSharedValue(0);

  const messageRef = useRef(props.message);
  messageRef.current = props.message;

  const onReplyRef = useRef(props.onReply);
  onReplyRef.current = props.onReply;

  const triggerReply = useCallback((msg: Message) => {
    hapticHeavy();
    onReplyRef.current?.(msg);
  }, []);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX(10)
        .onUpdate(e => {
          swipeTranslateX.value = Math.max(
            0,
            Math.min(e.translationX, MAX_SHIFT)
          );
        })
        .onEnd(e => {
          if (e.translationX > SWIPE_THRESHOLD) {
            scheduleOnRN(triggerReply, messageRef.current);
          }
        })
        .onFinalize(() => {
          swipeTranslateX.value = withSpring(0, {
            damping: 20,
            stiffness: 300
          });
        }),
    [swipeTranslateX, triggerReply]
  );

  const bubbleAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: swipeTranslateX.value }]
  }));

  const iconAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      swipeTranslateX.value,
      [0, ICON_FADE_DISTANCE],
      [0, 1],
      "clamp"
    )
  }));

  const swipeEnabled = !props.isMultiSelectMode;

  const replyIconStyle = {
    position: "absolute" as const,
    left: 10,
    top: 0,
    bottom: 0,
    justifyContent: "center" as const,
    alignItems: "center" as const,
    zIndex: -1
  };

  const bubbleBody = (
    <>
      {isMergedForwardContent(props.message.content) &&
      !props.message.is_recalled ? (
        <MergedForwardCard
          content={props.message.content}
          onPress={handleOpenMergedForward}
          onLongPress={handleLongPress}
        />
      ) : null}

      {props.message.reply_to ? (
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => handleJumpToReply(props.message.reply_to!.message_id)}
        >
          <ReplyPreviewBlock
            replyTo={props.message.reply_to}
            searchActive={props.searchActive}
            searchKeyword={props.searchKeyword}
          />
        </TouchableOpacity>
      ) : null}

      {voiceContent && !props.message.is_recalled ? (
        <VoiceBubbleContent
          message={props.message}
          content={voiceContent}
          isOwn={props.isOwn}
          voicePlaying={props.voicePlaying}
          voicePlayingPositionMs={props.voicePlayingPositionMs}
          onToggleVoicePlayback={handleToggleVoicePlayback}
          onLongPress={handleLongPress}
          inlineMetaLabel={inlineMetaLabel}
          inlineMetaStyle={inlineMetaStyle}
          showInlineReceipt={showInlineReceipt}
          isRead={isRead}
          receiptColor={receiptColor}
        />
      ) : null}

      {isPendingAttachment && attachmentFileContent ? (
        <PendingAttachmentBubble
          message={props.message}
          content={attachmentFileContent}
          isOwn={props.isOwn}
          onRetry={props.onRetryAttachment}
          onReselect={props.onReselectAttachment}
        />
      ) : null}

      {imageContent && !props.message.is_recalled ? (
        <ImageBubbleContent
          content={imageContent}
          isRecalled={!!props.message.is_recalled}
          imageCacheUri={imageCacheUri}
          messageId={
            props.message.client_message_id ||
            props.message.server_message_id ||
            null
          }
          onPreviewImage={handlePreviewImage}
          onLongPress={handleLongPress}
        />
      ) : null}

      {genericContent && !props.message.is_recalled ? (
        <FileBubbleContent
          content={genericContent}
          fileCacheState={fileCacheState}
          isOwn={props.isOwn}
          textStyle={textStyle}
          inlineMetaStyle={inlineMetaStyle}
          inlineMetaLabel={inlineMetaLabel}
          showInlineReceipt={showInlineReceipt}
          status={Number(props.message.status || 0)}
          read={isRead}
          receiptColor={receiptColor}
          onOpenAttachment={handleOpenAttachment}
          onLongPress={handleLongPress}
        />
      ) : null}

      {videoContent && !props.message.is_recalled ? (
        <VideoBubbleContent
          content={videoPreviewContent}
          messageId={
            props.message.client_message_id ||
            props.message.server_message_id ||
            null
          }
          onPreviewVideo={handlePreviewVideo}
          onLongPress={handleLongPress}
        />
      ) : null}

      {audioContent && !props.message.is_recalled ? (
        <AudioBubbleContent
          content={audioContent}
          voicePlaying={props.voicePlaying}
          onToggleVoicePlayback={handleToggleVoicePlayback}
          onLongPress={handleLongPress}
        />
      ) : null}

      {rendersTextMessage ? (
        <TextBubbleContent
          message={props.message}
          text={text}
          textStyle={textStyle}
          inlineMetaStyle={inlineMetaStyle}
          searchActive={props.searchActive}
          searchKeyword={props.searchKeyword}
          inlineMetaLabel={inlineMetaLabel}
          showInlineReceipt={showInlineReceipt}
          isRead={isRead}
          receiptColor={receiptColor}
        />
      ) : null}
    </>
  );

  const showSenderName = !props.isOwn && props.conversation.type !== 1;

  const swipeableBlock = (
    <>
      <View style={styles.bubblePinnedWrap}>
        <Animated.View
          ref={bubbleRef}
          style={{ transform: [{ scale: scaleAnim }] }}
        >
          <Pressable
            onLongPress={handleLongPress}
            delayLongPress={200}
            style={[
              styles.bubbleBase,
              bubbleStyle,
              isMediaMessage ? styles.bubbleMedia : null,
              props.selected ? styles.bubbleSelected : null
            ]}
          >
            {props.highlighted ? (
              <Reanimated.View
                pointerEvents="none"
                style={[styles.bubbleHighlightFlash, bubbleHighlightStyle]}
              />
            ) : null}
            <View testID="message-bubble-content">
              {bubbleBody}

              {!rendersTextMessage && !isVoiceMessage && !genericContent ? (
                isMediaMessage && mediaUsesOverlay ? (
                  <BubbleMetaRow
                    variant="media"
                    inlineMetaLabel={inlineMetaLabel}
                    showInlineReceipt={showInlineReceipt}
                    status={Number(props.message.status || 0)}
                    read={isRead}
                    receiptColor="rgba(255,255,255,0.92)"
                  />
                ) : (
                  <BubbleMetaRow
                    variant="inline"
                    inlineMetaLabel={inlineMetaLabel}
                    inlineMetaStyle={inlineMetaStyle}
                    showInlineReceipt={showInlineReceipt}
                    status={Number(props.message.status || 0)}
                    read={isRead}
                    receiptColor={receiptColor}
                    isOwn={props.isOwn}
                    isMergedForwardMessage={isMergedForwardMessage}
                  />
                )
              ) : null}
            </View>
          </Pressable>
        </Animated.View>
        {props.message.is_pinned ? (
          <View
            pointerEvents="none"
            style={[
              styles.bubblePinnedBadge,
              props.isOwn
                ? styles.bubblePinnedBadgeOwn
                : styles.bubblePinnedBadgeOther
            ]}
          >
            <Lucide name="pin" size={13} color={theme.colors.accent} />
          </View>
        ) : null}
      </View>

      {!props.message.is_recalled &&
      (props.message.reactions?.length ?? 0) > 0 ? (
        <MessageReactionBar
          reactions={props.message.reactions}
          currentUserId={props.loginUser?.userId ?? null}
          isOwn={props.isOwn}
          onToggle={handleToggleReaction}
          onOpenDetail={handleOpenReactionDetail}
        />
      ) : null}
    </>
  );

  const bubble = (
    <View style={styles.messageStack}>
      {showSenderName ? (
        <Text style={styles.messageSender}>{senderDisplayName}</Text>
      ) : null}
      {swipeEnabled ? (
        <View style={{ position: "relative" }}>
          <Reanimated.View
            pointerEvents="none"
            style={[replyIconStyle, iconAnimatedStyle]}
          >
            <Ionicons name="arrow-undo-outline" size={22} color="#007AFF" />
          </Reanimated.View>
          <GestureDetector gesture={panGesture}>
            <Reanimated.View style={bubbleAnimatedStyle}>
              {swipeableBlock}
            </Reanimated.View>
          </GestureDetector>
        </View>
      ) : (
        swipeableBlock
      )}
    </View>
  );

  if (isSystemMessage) {
    return <SystemTimelineRow text={text} />;
  }

  const multiSelectCheckbox = props.isMultiSelectMode ? (
    <MultiSelectCheckbox
      selected={!!props.isMultiSelected}
      onToggle={props.onMultiSelectToggle}
    />
  ) : null;

  const multiSelectBg =
    props.isMultiSelectMode && props.isMultiSelected
      ? { backgroundColor: "rgba(22,119,255,0.06)" }
      : undefined;

  if (props.isOwn) {
    return (
      <>
        <Pressable
          onPress={
            props.isMultiSelectMode ? props.onMultiSelectToggle : undefined
          }
          disabled={!props.isMultiSelectMode}
        >
          <View
            style={[
              { flexDirection: "row", alignItems: "center" },
              multiSelectBg
            ]}
          >
            <View
              style={[styles.messageRow, containerStyle, { flex: 1 }]}
              pointerEvents={props.isMultiSelectMode ? "none" : "auto"}
            >
              {bubble}
            </View>
            {multiSelectCheckbox}
          </View>
        </Pressable>
        {isBlockedFailure && failureLabel ? (
          <View style={styles.messageRow}>
            <View style={styles.systemMessageWrap}>
              <Text
                style={[
                  styles.systemMessageText,
                  styles.systemMessageTextDanger
                ]}
              >
                {failureLabel}
              </Text>
            </View>
          </View>
        ) : null}
      </>
    );
  }

  const isPrivateChat = props.conversation.type === 1;

  return (
    <Pressable
      onPress={props.isMultiSelectMode ? props.onMultiSelectToggle : undefined}
      disabled={!props.isMultiSelectMode}
    >
      <View
        style={[{ flexDirection: "row", alignItems: "center" }, multiSelectBg]}
      >
        {multiSelectCheckbox}
        <View
          style={[styles.messageRow, containerStyle, { flex: 1 }]}
          pointerEvents={props.isMultiSelectMode ? "none" : "auto"}
        >
          {isPrivateChat ? (
            bubble
          ) : (
            <View style={styles.messageAvatarRow}>
              <Pressable
                onPress={() => {
                  if (props.onMemberAvatarPress && props.message.sender_id) {
                    props.onMemberAvatarPress(
                      Number(props.message.sender_id),
                      senderDisplayName || "",
                      senderAvatar ?? null
                    );
                  }
                }}
                onLongPress={() => {
                  hapticHeavy();
                  if (
                    props.onMemberAvatarLongPress &&
                    props.message.sender_id
                  ) {
                    props.onMemberAvatarLongPress(
                      Number(props.message.sender_id),
                      senderDisplayName || "",
                      senderAvatar ?? null
                    );
                  }
                }}
                delayLongPress={300}
                disabled={
                  !props.onMemberAvatarPress && !props.onMemberAvatarLongPress
                }
              >
                <AppAvatar
                  label={senderDisplayName}
                  imageUrl={senderAvatar}
                  style={[
                    styles.messageMiniAvatar,
                    { backgroundColor: avatarColor }
                  ]}
                  textStyle={styles.messageMiniAvatarText}
                />
              </Pressable>
              {bubble}
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
});
