import type {
  MobileMessageSearchFilter,
  MobileMessageSearchResult
} from "@mushroom/app-core";
import {
  ContactListItem,
  Conversation,
  getLastOwnDeliveredMessageSequence,
  LoginUser,
  Message,
  parseGroupConversationSettings,
  parseMutedUntilMs,
  UserPresenceSummary
} from "@mushroom/shared";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  ImageBackground,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  View
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback } from "react";
import type { AppStackParamList } from "../../types/navigation";
import { i18n } from "../../i18n";
import { useChatBackground } from "../../styles/chat-background-context";
import { resolveChatBackground } from "../../styles/chat-backgrounds";
import {
  ForwardPanel,
  GroupAnnouncementBanner,
  MessageContextMenu,
  PinnedMessagesBanner,
  PinnedMessagesSheet
} from "../../features/chat";
import type { BatchForwardMode } from "../../app/controller/state/useChatInteractionState";
import { useAppTheme } from "../../styles/app-styles";
import { ChatDetailHeader } from "./header/ChatDetailHeader";
import { MessageList } from "./list/MessageList";
import { useMessageListData } from "./list/useMessageListData";
import { useMessageListScroll } from "./list/useMessageListScroll";
import { useMessageContextMenu } from "./menu/useMessageContextMenu";
import { ComposerHost } from "./composer/ComposerHost";
import {
  ChatDetailSheets,
  type ChatDetailSheetsHandle
} from "./sheets/ChatDetailSheets";
import { QuickVideoCamera } from "../../features/chat";

export type ChatDetailScreenProps = {
  activeConversation: Conversation;
  activeMessages: Message[];
  onLoadOlderMessages: () => void;
  isLoadingOlderMessages: boolean;
  hasMoreHistory: boolean;
  peerPresence: UserPresenceSummary | null;
  isPeerTyping: boolean;
  peerTypingActivity?: "text" | "voice" | null;
  /**
   * Group-typing subtitle prepared by upstream; takes precedence over the
   * 1:1 indicator when non-null.
   */
  groupTypingSubtitle?: string | null;
  selectedMessageId: string | null;
  highlightedMessageId: string | null;
  /** 单调递增；用于让搜索定位重试 effect 在边界重按时也能重新触发。 */
  highlightRequestNonce?: number;
  isSearchVisible: boolean;
  pending: boolean;
  composerText: string;
  composerToolsVisible: boolean;
  replyTarget: Message | null;
  selectedMessage: Message | null;
  forwardingMessageId: string | null;
  conversations: Conversation[];
  searchKeyword: string;
  searchFilter: MobileMessageSearchFilter;
  searchResults: MobileMessageSearchResult[];
  /** 当前会话的置顶消息（横条 + 面板共用）。 */
  pinnedMessages: MobileMessageSearchResult[];
  /** 置顶消息列表面板是否可见。 */
  pinnedMessagesVisible: boolean;
  onOpenPinnedMessages: () => void;
  onClosePinnedMessages: () => void;
  onJumpToPinnedMessage: (result: MobileMessageSearchResult) => void;
  onUnpinPinnedMessage: (message: Message) => void;
  voicePlayingMessageId: string | null;
  voicePlayingPositionMs: number;
  currentUserId?: number | null;
  currentLoginUser?: LoginUser | null;
  contacts: ContactListItem[];
  groupReadState: Record<number, number> | null;
  groupAnnouncement?: string;
  groupAnnouncementUpdatedAt?: string;
  onOpenGroupAnnouncement: () => void;
  /** 当前用户的"已读回执"开关；false 时所有勾被视为未读，UI 上隐藏 ✓✓。 */
  isReceiptsEnabled?: boolean;
  onBack: () => void;
  onOpenPeerProfile: () => void;
  onOpenMemberProfile: (
    memberId: number,
    memberName: string,
    memberAvatar: string | null
  ) => void;
  onToggleSearch: () => void;
  onCancelSearch: () => void;
  onSearchPrev: () => void;
  onSearchNext: () => void;
  isSearchNavigating?: boolean;
  onStartAudioCall: () => void;
  onStartVideoCall: () => void;
  onClearConversation: () => void;
  onChangeSearchKeyword: (value: string) => void;
  onChangeSearchFilter: (filter: MobileMessageSearchFilter) => void;
  onSelectSearchResult: (result: MobileMessageSearchResult) => void;
  canRecallMessage: (message: Message | null) => boolean;
  onReply: (message: Message) => void;
  onForward: (message: Message) => void;
  onToggleFavorite: (message: Message) => void;
  onTogglePin: (message: Message) => void;
  onRecall: (message: Message) => void;
  onToggleReaction: (message: Message, emoji: string | null) => void;
  onCloseSelectedMessage: () => void;
  onCancelForward: () => void;
  onForwardToConversation: (
    conversationId: string,
    extraMessage?: string
  ) => void;
  onCancelReply: () => void;
  onCancelVoiceRecording: () => void;
  onSelectMessage: (message: Message) => void;
  onPreviewImage: (message: Message) => void;
  onPreviewVideo: (message: Message) => void;
  onOpenAttachment: (message: Message) => void;
  onToggleVoicePlayback: (message: Message) => void;
  onRetryAttachment?: (message: Message) => void;
  /** 失败附件 + local_source_missing 时点击"重新选择文件"。 */
  onReselectAttachment?: (message: Message) => void;
  /** 删除一条失败本地附件草稿（长按菜单触发，无二次确认）。 */
  onDeleteFailedMessage?: (message: Message) => void;
  /** 保存图片或视频到系统相册。 */
  onSaveToAlbum?: (message: Message) => void;
  /** 保存文件或音频到手机本地。 */
  onSaveToFile?: (message: Message) => void;
  /** 复制文字消息文本到系统剪贴板。 */
  onCopyMessage?: (message: Message) => void;
  isMultiSelectMode: boolean;
  multiSelectedIds: Set<string>;
  batchForwardMode: BatchForwardMode | null;
  onEnterMultiSelectMode: (messageId: string) => void;
  onExitMultiSelectMode: () => void;
  onToggleMultiSelectMessage: (messageId: string) => void;
  onStartBatchForward: (mode: BatchForwardMode) => void;
  onBatchForwardToConversation: (
    conversationId: string,
    extraMessage?: string
  ) => void;
  onCancelBatchForward: () => void;
  onJumpToReply?: (serverMessageId: string) => void;
  onSendImage: () => void;
  onSendImageFromGallery: () => void;
  onSendImageFromCamera: () => void;
  onPickVideo: () => void;
  onConfirmSendImage: () => void;
  onCancelImagePreview: () => void;
  onSendFile: () => void;
  onToggleComposerTools: () => void;
  sendImageAsOriginal: boolean;
  pendingImageAsset:
    | import("../../platform/native-pickers").PickedMediaAsset
    | null;
  imagePreviewVisible: boolean;
  imagePreviewSendTopRight: boolean;
  cameraOverlayVisible: boolean;
  onCloseCameraOverlay: () => void;
  onConfirmCameraCapture: (videoPath: string, durationMs: number) => void;
  onVideoRecordingError: (error: Error) => void;
  onToggleSendImageAsOriginal: () => void;
  onStartVoiceRecording: () => void;
  onStopVoiceRecording: (durationMs: number) => void;
  onChangeComposerText: (value: string) => void;
  onSendMessage: () => void;
  /**
   * Lets the parent obtain an imperative scroll-to-bottom function bound to
   * the message list. The send pipeline uses it to force-scroll after sending
   * (matching WhatsApp/Telegram/微信). Pass `null` on unmount to clear.
   */
  registerScrollToLatest?: (fn: ((animated: boolean) => void) | null) => void;
  formatMediaDuration: (value: number) => string;
};

export const ChatDetailScreen = memo(function ChatDetailScreen(
  props: ChatDetailScreenProps
) {
  const { styles, theme } = useAppTheme();
  const navigation =
    useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const onOpenGroupManage = useCallback(
    () => navigation.navigate("GroupInfo"),
    [navigation]
  );
  const sheetsRef = useRef<ChatDetailSheetsHandle | null>(null);
  const composerTextRef = useRef(props.composerText);
  composerTextRef.current = props.composerText;

  // Android: track keyboard height to manually adjust bottom padding.
  // We avoid KeyboardAvoidingView on Android because its internal race condition
  // with the keyboardVerticalOffset prop can leave a permanent layout shift
  // (gray blank area) when the keyboard is dismissed.
  const [androidKeyboardHeight, setAndroidKeyboardHeight] = useState(0);
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const showListener = Keyboard.addListener("keyboardDidShow", e =>
      setAndroidKeyboardHeight(e.endCoordinates.height)
    );
    const hideListener = Keyboard.addListener("keyboardDidHide", () =>
      setAndroidKeyboardHeight(0)
    );
    return () => {
      showListener.remove();
      hideListener.remove();
    };
  }, []);
  const androidBottomPadding = androidKeyboardHeight;
  // iOS: KeyboardAvoidingView 把 onLayout 的 frame 视为相对父容器的坐标，
  // 但键盘 frame 是窗口坐标。keyboardVerticalOffset 必须等于容器在窗口内的
  // 顶部偏移（状态栏 + 头部高度），否则抬升量不足、输入框被键盘遮挡。
  // 运行时用 measureInWindow 动态测量，头部高度变化（搜索模式/字体缩放）时
  // 也能保持正确。
  const chatMessagesRef = useRef<View | null>(null);
  const [kavOffset, setKavOffset] = useState(0);
  const handleChatMessagesLayout = useCallback(() => {
    chatMessagesRef.current?.measureInWindow((_x, y) => {
      setKavOffset(prev => (prev === y ? prev : y));
    });
  }, []);
  // 稳定回调引用：避免每次渲染创建新闭包，与下游 React.memo 配合。
  const onOpenReactionDetail = useCallback(
    (msg: Message) => sheetsRef.current?.openReactionDetail(msg),
    []
  );

  const handleMemberAvatarLongPress = useCallback(
    (_senderId: number, senderName: string) => {
      const name =
        senderName || i18n.t("display.unknownUser", { id: _senderId });
      const mention = `@${name} `;
      const current = composerTextRef.current;
      const needsSpace =
        current.length > 0 && !current.endsWith(" ") && !current.endsWith("\n");
      props.onChangeComposerText(current + (needsSpace ? " " : "") + mention);
    },
    [props.onChangeComposerText]
  );

  const isDirectConversation = props.activeConversation.type === 1;
  const composerMode: "normal" | "muted-all" | "muted-self" = useMemo(() => {
    if (props.activeConversation.type !== 2) return "normal";
    const me = props.activeConversation.members?.find(
      m => Number(m.user_id) === Number(props.currentUserId)
    );
    const role = me?.role ?? 0;
    if (role >= 1) return "normal";
    const mutedUntilMs = parseMutedUntilMs(me?.muted_until);
    if (mutedUntilMs > Date.now()) {
      return "muted-self";
    }
    const settings = parseGroupConversationSettings(
      props.activeConversation.settings
    );
    return settings.mute_all ? "muted-all" : "normal";
  }, [
    props.activeConversation.type,
    props.activeConversation.members,
    props.activeConversation.settings,
    props.currentUserId
  ]);

  const lastOwnDeliveredSequence = getLastOwnDeliveredMessageSequence(
    props.activeMessages,
    props.currentUserId ?? null
  );
  const { chatBackgroundId } = useChatBackground();
  const chatBackground = resolveChatBackground(chatBackgroundId, theme.mode);
  const activeConversationKey = props.activeConversation.client_conversation_id;

  // Date-separator + list data + searchActiveIds.
  const { listData, searchActiveIds } = useMessageListData(
    props.activeMessages,
    props.searchResults
  );

  // All scroll-related state/refs/effects.
  // With inverted FlashList, the list naturally anchors to the bottom,
  // matching WhatsApp/Telegram/微信 behaviour.
  const {
    messageListRef,
    handleScroll,
    handleListLayout,
    handleContentSizeChange,
    handleLoadOlderMessages,
    handleScrollBeginDrag,
    showScrollToBottom,
    scrollToBottomOpacity,
    scrollToLatest,
    searchCurrentIndex
  } = useMessageListScroll({
    activeConversationKey,
    activeMessages: props.activeMessages,
    highlightedMessageId: props.highlightedMessageId,
    highlightRequestNonce: props.highlightRequestNonce,
    isMultiSelectMode: props.isMultiSelectMode,
    currentUserId: props.currentUserId,
    registerScrollToLatest: props.registerScrollToLatest,
    isSearchVisible: props.isSearchVisible,
    listData,
    searchResults: props.searchResults,
    onLoadOlderMessages: props.onLoadOlderMessages,
    isLoadingOlderMessages: props.isLoadingOlderMessages,
    hasMoreHistory: props.hasMoreHistory
  });

  // Long-press menu state + handlers.
  const { menuAnchor, handleMessageLongPress, handleCloseMenu } =
    useMessageContextMenu({
      onSelectMessage: props.onSelectMessage,
      onCloseSelectedMessage: props.onCloseSelectedMessage
    });

  const chatContent = (
    <>
      {props.activeConversation.type === 2 && props.groupAnnouncement ? (
        <GroupAnnouncementBanner
          conversationId={props.activeConversation.client_conversation_id}
          announcement={props.groupAnnouncement}
          announcementUpdatedAt={props.groupAnnouncementUpdatedAt}
          onPress={props.onOpenGroupAnnouncement}
        />
      ) : null}

      {!props.isSearchVisible ? (
        <PinnedMessagesBanner
          results={props.pinnedMessages}
          onOpenPanel={props.onOpenPinnedMessages}
          onJumpToMessage={props.onJumpToPinnedMessage}
        />
      ) : null}

      <MessageList
        messageListRef={messageListRef}
        listData={listData}
        isLoadingOlderMessages={props.isLoadingOlderMessages}
        hasMoreHistory={props.hasMoreHistory}
        onScroll={handleScroll}
        onLayout={handleListLayout}
        onContentSizeChange={handleContentSizeChange}
        onStartReached={handleLoadOlderMessages}
        onScrollBeginDrag={handleScrollBeginDrag}
        showScrollToBottom={showScrollToBottom}
        scrollToBottomOpacity={scrollToBottomOpacity}
        onScrollToLatest={() => scrollToLatest(true)}
        activeConversation={props.activeConversation}
        contacts={props.contacts}
        currentUserId={props.currentUserId}
        currentLoginUser={props.currentLoginUser}
        isDirectConversation={isDirectConversation}
        isReceiptsEnabled={props.isReceiptsEnabled}
        groupReadState={props.groupReadState}
        lastOwnDeliveredSequence={lastOwnDeliveredSequence}
        selectedMessageId={props.selectedMessageId}
        highlightedMessageId={props.highlightedMessageId}
        highlightRequestNonce={props.highlightRequestNonce}
        searchActiveIds={searchActiveIds}
        searchKeyword={props.searchKeyword}
        isMultiSelectMode={props.isMultiSelectMode}
        multiSelectedIds={props.multiSelectedIds}
        voicePlayingMessageId={props.voicePlayingMessageId}
        voicePlayingPositionMs={props.voicePlayingPositionMs}
        onSelectMessage={props.onSelectMessage}
        onMessageLongPress={handleMessageLongPress}
        onOpenMemberProfile={props.onOpenMemberProfile}
        onMemberAvatarLongPress={handleMemberAvatarLongPress}
        onPreviewImage={props.onPreviewImage}
        onPreviewVideo={props.onPreviewVideo}
        onOpenAttachment={props.onOpenAttachment}
        onToggleVoicePlayback={props.onToggleVoicePlayback}
        onToggleMultiSelectMessage={props.onToggleMultiSelectMessage}
        onToggleReaction={props.onToggleReaction}
        onOpenReactionDetail={onOpenReactionDetail}
        onRetryAttachment={props.onRetryAttachment}
        onReselectAttachment={props.onReselectAttachment}
        onJumpToReply={props.onJumpToReply}
        onReply={props.onReply}
      />

      <ComposerHost
        activeConversation={props.activeConversation}
        currentUserId={props.currentUserId}
        isSearchVisible={props.isSearchVisible}
        isMultiSelectMode={props.isMultiSelectMode}
        multiSelectedIds={props.multiSelectedIds}
        composerText={props.composerText}
        pending={props.pending}
        composerMode={composerMode}
        replyTarget={props.replyTarget}
        onChangeComposerText={props.onChangeComposerText}
        onCancelReply={props.onCancelReply}
        onCancelVoiceRecording={props.onCancelVoiceRecording}
        onSendMessage={props.onSendMessage}
        onStartVoiceRecording={props.onStartVoiceRecording}
        onStopVoiceRecording={props.onStopVoiceRecording}
        onToggleComposerTools={props.onToggleComposerTools}
        onStartBatchForward={props.onStartBatchForward}
        onExitMultiSelectMode={props.onExitMultiSelectMode}
      />
    </>
  );

  return (
    <View style={styles.chatShell}>
      <ChatDetailHeader
        activeConversation={props.activeConversation}
        isDirectConversation={isDirectConversation}
        peerPresence={props.peerPresence}
        isPeerTyping={props.isPeerTyping}
        peerTypingActivity={props.peerTypingActivity}
        groupTypingSubtitle={props.groupTypingSubtitle}
        isSearchVisible={props.isSearchVisible}
        searchKeyword={props.searchKeyword}
        searchFilter={props.searchFilter}
        searchResults={props.searchResults}
        searchCurrentIndex={searchCurrentIndex}
        isSearchNavigating={props.isSearchNavigating}
        onBack={props.onBack}
        onOpenPeerProfile={props.onOpenPeerProfile}
        onOpenGroupManage={onOpenGroupManage}
        onChangeSearchKeyword={props.onChangeSearchKeyword}
        onCancelSearch={props.onCancelSearch}
        onSearchPrev={props.onSearchPrev}
        onSearchNext={props.onSearchNext}
        onStartAudioCall={props.onStartAudioCall}
        onStartVideoCall={props.onStartVideoCall}
      />

      <MessageContextMenu
        visible={
          props.selectedMessage !== null &&
          menuAnchor !== null &&
          !props.forwardingMessageId
        }
        message={props.selectedMessage}
        anchor={menuAnchor}
        isOwn={
          Number(props.selectedMessage?.sender_id) ===
          Number(props.currentUserId)
        }
        replyTargetId={props.replyTarget?.client_message_id ?? null}
        canRecall={props.canRecallMessage(props.selectedMessage)}
        currentUserId={props.currentUserId ?? null}
        onReply={props.onReply}
        onForward={props.onForward}
        onTogglePin={props.onTogglePin}
        onRecall={props.onRecall}
        onReact={(message, emoji) => props.onToggleReaction(message, emoji)}
        onOpenEmojiPicker={message =>
          sheetsRef.current?.openEmojiPicker(message)
        }
        onMultiSelect={msg => {
          handleCloseMenu();
          setTimeout(
            () => props.onEnterMultiSelectMode(msg.client_message_id),
            80
          );
        }}
        onViewReadReceipts={
          props.activeConversation.type !== 1
            ? msg => {
                handleCloseMenu();
                setTimeout(
                  () => sheetsRef.current?.openGroupReadReceipts(msg),
                  80
                );
              }
            : undefined
        }
        onSaveToAlbum={props.onSaveToAlbum}
        onSaveToFile={props.onSaveToFile}
        onCopyMessage={props.onCopyMessage}
        onClose={handleCloseMenu}
        isFailedDraft={(() => {
          const m = props.selectedMessage;
          if (!m) return false;
          return (
            Number(m.status) === -1 &&
            !m.server_message_id &&
            Number(m.type) === 2
          );
        })()}
        onDeleteFailedMessage={props.onDeleteFailedMessage}
      />

      <PinnedMessagesSheet
        visible={props.pinnedMessagesVisible}
        results={props.pinnedMessages}
        onSelect={result => {
          props.onClosePinnedMessages();
          props.onJumpToPinnedMessage(result);
        }}
        onUnpin={props.onUnpinPinnedMessage}
        onClose={props.onClosePinnedMessages}
      />

      <ForwardPanel
        forwardingMessageId={props.forwardingMessageId}
        batchForwardMode={props.batchForwardMode}
        batchCount={props.multiSelectedIds.size}
        conversations={props.conversations}
        previewMessages={
          props.batchForwardMode
            ? props.activeMessages.filter(
                m =>
                  props.multiSelectedIds.has(m.client_message_id) &&
                  !m.is_recalled
              )
            : props.activeMessages.filter(
                m => m.client_message_id === props.forwardingMessageId
              )
        }
        onCancel={
          props.batchForwardMode
            ? props.onCancelBatchForward
            : props.onCancelForward
        }
        onForwardToConversation={
          props.batchForwardMode
            ? props.onBatchForwardToConversation
            : props.onForwardToConversation
        }
      />

      <View
        ref={chatMessagesRef}
        style={styles.chatMessages}
        onLayout={handleChatMessagesLayout}
      >
        <ImageBackground
          source={chatBackground.source}
          resizeMode={chatBackground.resizeMode}
          style={StyleSheet.absoluteFill}
          imageStyle={styles.chatMessagesBackgroundImage}
        >
          {chatBackground.darkOverlay ? (
            <View style={styles.chatBackgroundOverlay} />
          ) : null}
        </ImageBackground>

        {Platform.OS === "ios" ? (
          <KeyboardAvoidingView
            style={styles.chatMessagesInner}
            behavior="padding"
            keyboardVerticalOffset={kavOffset}
          >
            {chatContent}
          </KeyboardAvoidingView>
        ) : (
          <View
            style={[
              styles.chatMessagesInner,
              { paddingBottom: androidBottomPadding }
            ]}
          >
            {chatContent}
          </View>
        )}
      </View>

      <ChatDetailSheets
        ref={sheetsRef}
        activeConversation={props.activeConversation}
        activeMessages={props.activeMessages}
        contacts={props.contacts}
        currentUserId={props.currentUserId}
        currentLoginUser={props.currentLoginUser}
        groupReadState={props.groupReadState}
        composerToolsVisible={props.composerToolsVisible}
        imagePreviewVisible={props.imagePreviewVisible}
        pendingImageAsset={props.pendingImageAsset}
        imagePreviewSendTopRight={props.imagePreviewSendTopRight}
        sendImageAsOriginal={props.sendImageAsOriginal}
        pending={props.pending}
        onToggleComposerTools={props.onToggleComposerTools}
        onSendImageFromGallery={props.onSendImageFromGallery}
        onSendImageFromCamera={props.onSendImageFromCamera}
        onPickVideo={props.onPickVideo}
        onSendFile={props.onSendFile}
        onToggleSendImageAsOriginal={props.onToggleSendImageAsOriginal}
        onCancelImagePreview={props.onCancelImagePreview}
        onConfirmSendImage={props.onConfirmSendImage}
        onToggleReaction={props.onToggleReaction}
      />

      <QuickVideoCamera
        visible={props.cameraOverlayVisible}
        onClose={props.onCloseCameraOverlay}
        onCapture={props.onConfirmCameraCapture}
        onError={props.onVideoRecordingError}
      />
    </View>
  );
});
