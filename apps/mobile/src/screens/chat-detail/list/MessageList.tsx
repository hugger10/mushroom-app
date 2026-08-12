import { FlashList } from "@shopify/flash-list";
import {
  ContactListItem,
  Conversation,
  hasPeerReadMessage,
  isGroupMessageRead,
  isMergedForwardContent,
  LoginUser,
  Message
} from "@mushroom/shared";
import { useCallback } from "react";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { useTranslation } from "react-i18next";
import { DateSeparatorRow, MessageBubble } from "../../../features/chat";
import type { MessageMenuAnchor } from "../../../features/chat";
import { useAppTheme } from "../../../styles/app-styles";
import type { AppStackParamList } from "../../../types/navigation";
import {
  getMessageItemType,
  isDateSeparatorItem,
  MessageListSeparator,
  type ChatListItem
} from "./MessageListItem.types";
import type { FlashListRef } from "@shopify/flash-list";

export type MessageListProps = {
  // List data + refs
  messageListRef: React.RefObject<FlashListRef<ChatListItem> | null>;
  listData: ChatListItem[];
  isLoadingOlderMessages: boolean;
  hasMoreHistory: boolean;
  // Scroll handlers
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onLayout: (event: { nativeEvent: { layout: { height: number } } }) => void;
  onContentSizeChange: (contentWidth: number, contentHeight: number) => void;
  onStartReached: () => void;
  onScrollBeginDrag: () => void;
  // Floating "scroll to bottom" button
  showScrollToBottom: boolean;
  scrollToBottomOpacity: Animated.Value;
  onScrollToLatest: () => void;
  // Item rendering deps
  activeConversation: Conversation;
  contacts: ContactListItem[];
  currentUserId?: number | null;
  currentLoginUser?: LoginUser | null;
  isDirectConversation: boolean;
  isReceiptsEnabled?: boolean;
  groupReadState: Record<number, number> | null;
  lastOwnDeliveredSequence: number | null | undefined;
  selectedMessageId: string | null;
  highlightedMessageId: string | null;
  /** 单调递增；即使 highlightedMessageId 未变（2s 内重复跳转同一引用），也重播闪烁动画。 */
  highlightRequestNonce?: number;
  searchActiveIds: Set<string>;
  searchKeyword: string;
  isMultiSelectMode: boolean;
  multiSelectedIds: Set<string>;
  voicePlayingMessageId: string | null;
  voicePlayingPositionMs: number;
  // Item callbacks
  onSelectMessage: (message: Message) => void;
  onMessageLongPress: (message: Message, anchor: MessageMenuAnchor) => void;
  onOpenMemberProfile: (
    memberId: number,
    memberName: string,
    memberAvatar: string | null
  ) => void;
  onMemberAvatarLongPress: (
    senderId: number,
    senderName: string,
    senderAvatar: string | null
  ) => void;
  onPreviewImage: (message: Message) => void;
  onPreviewVideo: (message: Message) => void;
  onOpenAttachment: (message: Message) => void;
  onToggleVoicePlayback: (message: Message) => void;
  onToggleMultiSelectMessage: (messageId: string) => void;
  onToggleReaction: (message: Message, emoji: string | null) => void;
  onOpenReactionDetail: (message: Message) => void;
  onRetryAttachment?: (message: Message) => void;
  /** 失败附件 + local_source_missing 时点击"重新选择文件"。 */
  onReselectAttachment?: (message: Message) => void;
  onJumpToReply?: (serverMessageId: string) => void;
  onReply?: (message: Message) => void;
};

export function MessageList(props: MessageListProps) {
  const { styles, theme } = useAppTheme();
  const { t } = useTranslation();
  const navigation =
    useNavigation<NativeStackNavigationProp<AppStackParamList>>();

  // 稳定回调：避免 renderItem 中创建新闭包，破坏 MessageBubble 的 React.memo
  const handleOpenMergedForward = useCallback(
    (message: Message) => {
      if (isMergedForwardContent(message.content)) {
        navigation.navigate("MergedForwardDetail", {
          content: message.content
        });
      }
    },
    [navigation]
  );

  return (
    <View style={styles.chatMessagesBackground}>
      <FlashList
        ref={props.messageListRef}
        data={props.listData}
        inverted
        keyExtractor={item =>
          isDateSeparatorItem(item)
            ? item.key
            : `${item.client_message_id}:${item.server_message_id}`
        }
        style={styles.chatMessagesScroll}
        contentContainerStyle={styles.chatMessagesContent}
        ItemSeparatorComponent={MessageListSeparator}
        showsVerticalScrollIndicator={false}
        bounces
        alwaysBounceVertical
        overScrollMode="always"
        getItemType={getMessageItemType}
        drawDistance={1000}
        onScroll={props.onScroll}
        scrollEventThrottle={16}
        onLayout={props.onLayout}
        onContentSizeChange={props.onContentSizeChange}
        onEndReached={props.onStartReached}
        onEndReachedThreshold={0.18}
        onScrollBeginDrag={props.onScrollBeginDrag}
        maintainVisibleContentPosition={{
          autoscrollToTopThreshold: 0.01,
          animateAutoScrollToBottom: false
        }}
        keyboardShouldPersistTaps="handled"
        testID="chat-message-scroll"
        ListFooterComponent={
          props.listData.length > 0 ? (
            props.isLoadingOlderMessages ? (
              <View style={styles.loadingHistoryHint}>
                <ActivityIndicator size="small" />
                <Text style={styles.loadingHistoryHintText}>
                  {t("chat.loadingHistory")}
                </Text>
              </View>
            ) : !props.hasMoreHistory ? (
              <View style={styles.noMoreHistoryHint}>
                <Text style={styles.noMoreHistoryHintText}>
                  {t("chat.noMoreHistory")}
                </Text>
              </View>
            ) : null
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.noMoreHistoryHint}>
            <Text style={styles.noMoreHistoryHintText}>
              {t("chat.noMoreHistory")}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          if (isDateSeparatorItem(item)) {
            return <DateSeparatorRow label={item.label} />;
          }
          const message = item;
          return (
            <MessageBubble
              message={message}
              conversation={props.activeConversation}
              contacts={props.contacts}
              isOwn={Number(message.sender_id) === Number(props.currentUserId)}
              loginUser={props.currentLoginUser}
              peerLastReadSequence={Number(
                props.activeConversation.peer_last_read_sequence || 0
              )}
              peerHasRead={
                props.isReceiptsEnabled === false
                  ? false
                  : props.isDirectConversation
                    ? hasPeerReadMessage(
                        props.activeConversation.peer_last_read_sequence,
                        message.sequence
                      )
                    : isGroupMessageRead(
                        message.sequence,
                        props.groupReadState,
                        message.sender_id
                      )
              }
              showReadReceipt={
                Number(message.sender_id) === Number(props.currentUserId) &&
                Number(message.sequence || 0) ===
                  Number(props.lastOwnDeliveredSequence || 0)
              }
              selected={props.selectedMessageId === message.client_message_id}
              highlighted={
                props.highlightedMessageId === message.client_message_id
              }
              highlightRequestNonce={props.highlightRequestNonce}
              searchActive={props.searchActiveIds.has(
                message.client_message_id
              )}
              searchKeyword={props.searchKeyword}
              onSelectMessage={props.onSelectMessage}
              onLongPress={props.onMessageLongPress}
              onMemberAvatarPress={
                !props.isDirectConversation &&
                Number(message.sender_id) !== Number(props.currentUserId)
                  ? props.onOpenMemberProfile
                  : undefined
              }
              onMemberAvatarLongPress={
                !props.isDirectConversation &&
                Number(message.sender_id) !== Number(props.currentUserId)
                  ? props.onMemberAvatarLongPress
                  : undefined
              }
              onPreviewImageMessage={props.onPreviewImage}
              onPreviewVideoMessage={props.onPreviewVideo}
              onOpenAttachmentMessage={props.onOpenAttachment}
              onToggleVoicePlaybackMessage={props.onToggleVoicePlayback}
              voicePlaying={
                props.voicePlayingMessageId === message.client_message_id
              }
              voicePlayingPositionMs={
                props.voicePlayingMessageId === message.client_message_id
                  ? props.voicePlayingPositionMs
                  : 0
              }
              isMultiSelectMode={props.isMultiSelectMode}
              isMultiSelected={props.multiSelectedIds.has(
                message.client_message_id
              )}
              onMultiSelectToggle={() =>
                props.onToggleMultiSelectMessage(message.client_message_id)
              }
              onOpenMergedForward={handleOpenMergedForward}
              onToggleReaction={props.onToggleReaction}
              onOpenReactionDetail={props.onOpenReactionDetail}
              onRetryAttachment={props.onRetryAttachment}
              onReselectAttachment={props.onReselectAttachment}
              onJumpToReply={props.onJumpToReply}
              onReply={props.onReply}
            />
          );
        }}
      />
      <Animated.View
        pointerEvents={props.showScrollToBottom ? "auto" : "none"}
        style={{
          position: "absolute",
          right: 16,
          bottom: 16,
          opacity: props.scrollToBottomOpacity
        }}
      >
        <Pressable
          onPress={props.onScrollToLatest}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: theme.colors.glassStrong,
            borderWidth: 1,
            borderColor: theme.colors.border,
            alignItems: "center",
            justifyContent: "center",
            shadowColor: "#000",
            shadowOpacity: 0.12,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 2 },
            elevation: 4
          }}
        >
          <Ionicons name="chevron-down" size={22} color={theme.colors.text} />
        </Pressable>
      </Animated.View>
    </View>
  );
}
