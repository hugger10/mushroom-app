import {
  Fragment,
  memo,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode
} from "react";
import {
  getLastOwnDeliveredMessageSequence,
  isFileMessageContent,
  isImageFileMessageContent
} from "@mushroom/shared";
import { formatMessageDateLabel } from "../../utils/date";
import chatDoodle from "../../assets/chat-doodle.svg";
import type { Conversation, Message } from "../../types/chat";
import type { LoginUser } from "../../types/user";
import type { ContactsLookup } from "../../utils/display";
import { computeMessageGroups } from "./messageGrouping";
import { useIsReceiptsEnabled } from "../../hooks/useMyPrivacySettings";
import { useTranslation } from "react-i18next";
import { SystemMessageChip } from "./message-list/SystemMessageChip";
import { DateSeparator } from "./message-list/DateSeparator";
import { MessageRow } from "./message-list/MessageRow";
import { ReactionDetailModal } from "./message-list/ReactionDetailModal";
import {
  FloatingActions,
  LoadingHistoryHeader,
  NoMoreHistoryFooter
} from "./message-list/ListChrome";
import { useMessageContextMenu } from "./message-list/useMessageContextMenu";
import { computeDateSeparatorLabels } from "./message-list/messageListUtils";

interface MessageListProps {
  activeConversation: Conversation;
  messages: Message[];
  loginUser: LoginUser;
  /** Local contacts cache; used to resolve `remark_name → nickname → username`. */
  contacts?: ContactsLookup;
  isLoadingMore: boolean;
  hasMore: boolean;
  highlightMessageId: string | null;
  searchKeyword?: string;
  messagesContainerRef: React.RefObject<HTMLDivElement | null>;
  topSentinelRef: React.RefObject<HTMLDivElement | null>;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  showScrollToBottom: boolean;
  onScrollToBottom: () => void;
  showMentionReminder?: boolean;
  onMentionReminderClick?: () => void;
  onReply: (message: Message) => void;
  onRecallMessage: (message: Message) => void;
  onRetryMessage: (message: Message) => void;
  /** 失败附件气泡的"重新选择文件"。可选；缺省时退化为普通 retry。 */
  onReselectAttachment?: (message: Message, file: File) => void;
  onJumpToReply: (serverMessageId: string) => void;
  onOpenImagePreview: (images: Message[], index: number) => void;
  onOpenVideoPlayer?: (args: { url: string; uploadId?: string }) => void;
  renderMessageAvatar?: (
    message: Message,
    defaultAvatar: ReactNode
  ) => ReactNode;
  isSelectionMode?: boolean;
  selectedMessageIds?: Set<string>;
  onToggleMessageSelection?: (messageId: string) => void;
  onEnterSelectionMode?: (messageId: string) => void;
  onOpenMergedForward?: (message: Message) => void;
  onForwardMessage?: (message: Message) => void;
  // 群已读高水位（仅当前活动会话），key 为 reader user_id。
  groupReadState?: Record<number, number> | null;
  /** 打开"查看已读"详情面板（仅群消息 + 自己发的可触发）。 */
  onViewGroupReadReceipts?: (message: Message) => void;
  /** 删除一条失败的本地附件草稿（无二次确认）。 */
  onDeleteFailedMessage?: (message: Message) => void;
}

/**
 * Chat-window message list skeleton.
 *
 * Responsibilities kept at the list level:
 *  - Stable list-level derived data (`imageMessages`, `messageGroups`,
 *    `dateSeparators`, `enteringIds`, `lastOwnDeliveredSequence`).
 *  - Reaction-detail modal state.
 *  - Scroll container + sticky load-more header + "no more history" footer.
 *  - Floating actions (scroll-to-bottom, @-me reminder).
 *
 * Per-row rendering lives in `./message-list/MessageRow.tsx`.
 */
export const MessageList = memo(function MessageList({
  activeConversation,
  messages,
  loginUser,
  contacts,
  isLoadingMore,
  hasMore,
  highlightMessageId,
  searchKeyword = "",
  messagesContainerRef,
  topSentinelRef,
  messagesEndRef,
  showScrollToBottom,
  onScrollToBottom,
  showMentionReminder = false,
  onMentionReminderClick,
  onReply,
  onRecallMessage,
  onRetryMessage,
  onReselectAttachment,
  onJumpToReply,
  onOpenImagePreview,
  onOpenVideoPlayer,
  renderMessageAvatar,
  isSelectionMode = false,
  selectedMessageIds,
  onToggleMessageSelection,
  onEnterSelectionMode,
  onOpenMergedForward,
  onForwardMessage,
  groupReadState = null,
  onViewGroupReadReceipts,
  onDeleteFailedMessage
}: MessageListProps) {
  const { t } = useTranslation();
  const receiptsEnabled = useIsReceiptsEnabled();

  const imageMessages = useMemo(
    () =>
      messages.filter(
        msg =>
          !msg.is_recalled &&
          isFileMessageContent(msg.content) &&
          isImageFileMessageContent(msg.content)
      ),
    [messages]
  );

  // Bubble-shape group position per message (first / middle / last / alone).
  const messageGroups = useMemo(
    () => computeMessageGroups(messages),
    [messages]
  );

  // i18n date-separator labels — recomputed only when language changes.
  const dateSeparatorLabels = useMemo(() => computeDateSeparatorLabels(t), [t]);

  // For each visible message decide whether a date separator should precede it
  // (first message, or its calendar day differs from the previous one).
  const dateSeparators = useMemo(() => {
    const labels = dateSeparatorLabels;
    const now = new Date();
    const out = new Map<string, string>();
    let prev: Date | null = null;
    for (const msg of messages) {
      const ts = msg.created_at ? new Date(msg.created_at) : null;
      if (!ts || Number.isNaN(ts.getTime())) {
        prev = ts && !Number.isNaN(ts.getTime()) ? ts : prev;
        continue;
      }
      const sameDay =
        prev !== null &&
        prev.getFullYear() === ts.getFullYear() &&
        prev.getMonth() === ts.getMonth() &&
        prev.getDate() === ts.getDate();
      if (!sameDay) {
        out.set(msg.client_message_id, formatMessageDateLabel(ts, now, labels));
      }
      prev = ts;
    }
    return out;
  }, [messages, dateSeparatorLabels]);

  const [reactionDetailMessageId, setReactionDetailMessageId] = useState<
    string | null
  >(null);
  const reactionDetailMessage = useMemo(
    () =>
      reactionDetailMessageId
        ? (messages.find(
            item => item.client_message_id === reactionDetailMessageId
          ) ?? null)
        : null,
    [messages, reactionDetailMessageId]
  );

  // Track entering messages (real-time only) for slide-in animation.
  // Synchronous ref-comparison avoids flicker.
  const prevLastIdRef = useRef<string | null>(null);
  const enteringIds = useMemo(() => {
    const ids = new Set<string>();
    const prevLastId = prevLastIdRef.current;
    if (prevLastId !== null && messages.length > 0) {
      let foundPrev = false;
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].client_message_id === prevLastId) {
          foundPrev = true;
          break;
        }
        ids.add(messages[i].client_message_id);
      }
      // If prevLastId not found (e.g. conversation switch), don't animate.
      if (!foundPrev) ids.clear();
    }
    if (messages.length > 0) {
      prevLastIdRef.current = messages[messages.length - 1].client_message_id;
    } else {
      prevLastIdRef.current = null;
    }
    return ids;
  }, [messages]);

  const lastOwnDeliveredSequence = getLastOwnDeliveredMessageSequence(
    messages,
    loginUser.userId
  );

  const getContextMenuItems = useMessageContextMenu({
    activeConversation,
    loginUser,
    onReply,
    onRecallMessage,
    onForwardMessage,
    onEnterSelectionMode,
    onViewGroupReadReceipts,
    onDeleteFailedMessage
  });

  return (
    <>
      <div
        className="im-chat-bg-wrapper chat-bg"
        style={
          {
            "--im-chat-doodle": `url("${chatDoodle}")`
          } as CSSProperties
        }
      >
        <div ref={messagesContainerRef} className="im-message-scroll">
          <div
            ref={topSentinelRef}
            style={{
              height: 1,
              background: "transparent",
              marginBottom: 8
            }}
          />

          <LoadingHistoryHeader visible={isLoadingMore} />
          <NoMoreHistoryFooter visible={!hasMore} />

          {messages.map(msg => {
            const dateLabel = dateSeparators.get(msg.client_message_id);

            if (msg.type === 0) {
              return (
                <Fragment key={msg.client_message_id}>
                  {dateLabel ? <DateSeparator label={dateLabel} /> : null}
                  <SystemMessageChip message={msg} />
                </Fragment>
              );
            }

            return (
              <MessageRow
                key={msg.client_message_id}
                message={msg}
                activeConversation={activeConversation}
                loginUser={loginUser}
                contacts={contacts}
                groupPosition={
                  messageGroups.get(msg.client_message_id) || "alone"
                }
                isEntering={enteringIds.has(msg.client_message_id)}
                isHighlighted={highlightMessageId === msg.client_message_id}
                dateSeparatorLabel={dateLabel}
                imageMessages={imageMessages}
                searchKeyword={searchKeyword}
                receiptsEnabled={receiptsEnabled}
                lastOwnDeliveredSequence={lastOwnDeliveredSequence}
                groupReadState={groupReadState}
                isSelectionMode={isSelectionMode}
                isSelected={
                  isSelectionMode &&
                  !!selectedMessageIds?.has(msg.client_message_id)
                }
                onToggleSelection={onToggleMessageSelection}
                contextMenuItems={getContextMenuItems(msg)}
                onRetryMessage={onRetryMessage}
                onReselectAttachment={onReselectAttachment}
                onJumpToReply={onJumpToReply}
                onOpenImagePreview={onOpenImagePreview}
                onOpenVideoPlayer={onOpenVideoPlayer}
                onOpenMergedForward={onOpenMergedForward}
                onOpenReactionDetail={setReactionDetailMessageId}
                renderMessageAvatar={renderMessageAvatar}
              />
            );
          })}

          <div ref={messagesEndRef} />
        </div>
      </div>

      <FloatingActions
        showMentionReminder={showMentionReminder}
        onMentionReminderClick={onMentionReminderClick}
        showScrollToBottom={showScrollToBottom}
        onScrollToBottom={onScrollToBottom}
      />

      <ReactionDetailModal
        message={reactionDetailMessage}
        activeConversation={activeConversation}
        loginUser={loginUser}
        onClose={() => setReactionDetailMessageId(null)}
      />
    </>
  );
});
