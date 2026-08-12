import { Fragment, memo, type ReactNode } from "react";
import { Dropdown } from "antd";
import type { MenuProps } from "antd";
import { CheckCircleFilled } from "@ant-design/icons";
import {
  isFileMessageContent,
  isImageFileMessageContent,
  isVideoFileMessageContent,
  computeImageBubbleSize
} from "@mushroom/shared";
import { formatMessageTime } from "../../../utils/date";
import { UserAvatar } from "../../avatars/UserAvatar";
import type { Conversation, Message } from "../../../types/chat";
import type { LoginUser } from "../../../types/user";
import {
  getConversationUserDisplayName,
  getMessageSenderDisplayName,
  type ContactsLookup
} from "../../../utils/display";
import { isBlockedSendFailure } from "../../../utils/messageTimeline";
import type { BubbleGroupPosition } from "../messageGrouping";
import { DateSeparator } from "./DateSeparator";
import { MessageBody } from "./MessageBody";
import { MessageStatusIndicator } from "./MessageStatusIndicator";
import { ReactionCapsules } from "./ReactionCapsules";
import { ReplyQuoteBlock } from "./ReplyQuoteBlock";
import { getMessageFailureText } from "./messageListUtils";

interface MessageRowProps {
  message: Message;
  activeConversation: Conversation;
  loginUser: LoginUser;
  /** Local contacts cache; used to resolve `remark_name → nickname → username`. */
  contacts?: ContactsLookup;
  /** Bubble-shape position within a same-sender run. Computed at list level. */
  groupPosition: BubbleGroupPosition;
  /** Whether this row should slide-in (newly arrived). */
  isEntering: boolean;
  /** Whether this row is currently the jump-to-highlighted message. */
  isHighlighted: boolean;
  /** Pre-computed date separator label to render above the row (if any). */
  dateSeparatorLabel?: string;
  /** Full image-message list (for lightbox indexing in MessageBody). */
  imageMessages: Message[];
  searchKeyword?: string;
  receiptsEnabled: boolean;
  lastOwnDeliveredSequence: number;
  groupReadState?: Record<number, number> | null;
  /** Highest readable receipts data. Forwarded down. */
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelection?: (clientMessageId: string) => void;
  /** Context-menu items computed via useMessageContextMenu hook. */
  contextMenuItems: MenuProps["items"];
  onRetryMessage: (message: Message) => void;
  /** 失败附件气泡的"重新选择文件"。可选；缺省时退化为普通 retry。 */
  onReselectAttachment?: (message: Message, file: File) => void;
  onJumpToReply: (serverMessageId: string) => void;
  onOpenImagePreview: (images: Message[], index: number) => void;
  onOpenVideoPlayer?: (args: { url: string; uploadId?: string }) => void;
  onOpenMergedForward?: (message: Message) => void;
  onOpenReactionDetail: (clientMessageId: string) => void;
  renderMessageAvatar?: (
    message: Message,
    defaultAvatar: ReactNode
  ) => ReactNode;
}

/**
 * Single message row: avatar + author label + bubble (content + status) + reactions
 * + mention badge + per-row error text + optional blocked-failure notice.
 *
 * Wraps everything (except date separator) in an antd <Dropdown trigger="contextMenu">
 * when context menu items are present and selection mode is off. The selection-mode
 * click handler lives on the outermost row div; bubbles must not stopPropagation.
 */
export const MessageRow = memo(function MessageRow({
  message: msg,
  activeConversation,
  loginUser,
  contacts,
  groupPosition,
  isEntering,
  isHighlighted,
  dateSeparatorLabel,
  imageMessages,
  searchKeyword,
  receiptsEnabled,
  lastOwnDeliveredSequence,
  groupReadState,
  isSelectionMode = false,
  isSelected = false,
  onToggleSelection,
  contextMenuItems,
  onRetryMessage,
  onReselectAttachment,
  onJumpToReply,
  onOpenImagePreview,
  onOpenVideoPlayer,
  onOpenMergedForward,
  onOpenReactionDetail,
  renderMessageAvatar
}: MessageRowProps) {
  const isSelf = msg.sender_id === loginUser.userId;
  const isPrivateChat = activeConversation.type === 1;
  const isBlockedFailure =
    isSelf && msg.status === -1 && isBlockedSendFailure(msg.last_error);
  const timeLabel = formatMessageTime(msg.created_at);
  const rendersTextMessage =
    !isFileMessageContent(msg.content) || msg.is_recalled;
  const isGroupedFollowUp =
    groupPosition === "middle" || groupPosition === "last";
  const showAvatar = isPrivateChat ? false : !isSelf && !isGroupedFollowUp;
  const showAuthor = isPrivateChat ? false : !isSelf && !isGroupedFollowUp;
  const isMediaMessage =
    !msg.is_recalled &&
    isFileMessageContent(msg.content) &&
    (isImageFileMessageContent(msg.content) ||
      isVideoFileMessageContent(msg.content));
  // 图片消息：当真实渲染宽度太小（chip 放不下）时，把时间戳/已读 chip
  // 渲染到气泡下方而非叠加。视频气泡因为有播放按钮覆盖，保持 overlay。
  let mediaUsesOverlay = false;
  if (isMediaMessage && isFileMessageContent(msg.content)) {
    if (isVideoFileMessageContent(msg.content)) {
      mediaUsesOverlay = true;
    } else if (isImageFileMessageContent(msg.content as unknown)) {
      const fileContent = msg.content as {
        width?: number;
        height?: number;
      };
      const sized = computeImageBubbleSize({
        width: fileContent.width,
        height: fileContent.height
      });
      mediaUsesOverlay = !sized.useExternalFooter;
    }
  }
  const canSelect = isSelectionMode && !msg.is_recalled && msg.type !== 0;
  const handleSelectionClick = () => {
    if (isSelectionMode && canSelect) {
      onToggleSelection?.(msg.client_message_id);
    }
  };

  const defaultAvatar = (
    <UserAvatar
      className="im-message-avatar"
      size={40}
      src={msg.sender_avatar}
      name={getMessageSenderDisplayName(
        activeConversation,
        loginUser,
        msg,
        contacts
      )}
      style={{
        marginRight: isSelf ? 0 : 8,
        marginLeft: isSelf ? 8 : 0
      }}
    />
  );

  const failureText = getMessageFailureText(msg);

  const messageNode = (
    <div
      data-message-id={msg.client_message_id}
      className={`im-message-row ${
        isSelf ? "im-message-row-self" : "im-message-row-other"
      } ${isHighlighted ? "im-message-row-highlighted" : ""} ${
        isGroupedFollowUp ? "im-message-row-grouped" : ""
      } ${isEntering ? "im-message-entering" : ""} ${
        isSelected ? "im-message-row-selected" : ""
      }`}
      onClick={isSelectionMode ? handleSelectionClick : undefined}
      style={isSelectionMode ? { cursor: "pointer" } : undefined}
    >
      {isSelectionMode ? (
        <div className="im-message-checkbox">
          {isSelected ? (
            <CheckCircleFilled style={{ fontSize: 22, color: "#1677ff" }} />
          ) : (
            <div className="im-message-checkbox-empty" />
          )}
        </div>
      ) : null}
      {showAvatar ? (
        renderMessageAvatar ? (
          renderMessageAvatar(msg, defaultAvatar)
        ) : (
          defaultAvatar
        )
      ) : !isPrivateChat && !isSelf ? (
        <div className="im-message-avatar-spacer" />
      ) : null}

      <div
        className={`im-message-stack ${
          isSelf ? "im-message-stack-self" : "im-message-stack-other"
        }`}
      >
        {showAuthor ? (
          <div className="im-message-author">
            {getConversationUserDisplayName(
              activeConversation,
              loginUser,
              msg.sender_id,
              msg.sender_nickname,
              contacts
            )}
          </div>
        ) : null}

        <div
          className={`im-message-bubble ${
            isSelf ? "im-message-bubble-self" : "im-message-bubble-other"
          } ${rendersTextMessage ? "im-message-bubble-textual" : ""} im-bubble-${groupPosition}${
            isMediaMessage ? " im-bubble-media" : ""
          }${
            isMediaMessage && !mediaUsesOverlay
              ? " im-bubble-media-external-footer"
              : ""
          }`}
        >
          <ReplyQuoteBlock
            message={msg}
            activeConversation={activeConversation}
            loginUser={loginUser}
            contacts={contacts}
            onJumpToReply={onJumpToReply}
          />
          {rendersTextMessage ? (
            <div className="im-message-text-wrap">
              <span className="im-message-text-content">
                <MessageBody
                  message={msg}
                  loginUser={loginUser}
                  contacts={contacts}
                  imageMessages={imageMessages}
                  searchKeyword={searchKeyword}
                  onOpenImagePreview={onOpenImagePreview}
                  onOpenVideoPlayer={onOpenVideoPlayer}
                  onOpenMergedForward={onOpenMergedForward}
                  onRetryMessage={onRetryMessage}
                  onReselectAttachment={onReselectAttachment}
                />
              </span>
              <span className="im-message-time-inline">
                {timeLabel}
                <MessageStatusIndicator
                  message={msg}
                  loginUser={loginUser}
                  activeConversation={activeConversation}
                  receiptsEnabled={receiptsEnabled}
                  lastOwnDeliveredSequence={lastOwnDeliveredSequence}
                  groupReadState={groupReadState}
                  onRetry={onRetryMessage}
                />
              </span>
            </div>
          ) : (
            <>
              <MessageBody
                message={msg}
                loginUser={loginUser}
                contacts={contacts}
                imageMessages={imageMessages}
                searchKeyword={searchKeyword}
                onOpenImagePreview={onOpenImagePreview}
                onOpenVideoPlayer={onOpenVideoPlayer}
                onOpenMergedForward={onOpenMergedForward}
                onRetryMessage={onRetryMessage}
                onReselectAttachment={onReselectAttachment}
              />
              <div className="im-message-bubble-footer">
                <span className="im-message-time-inline">
                  {timeLabel}
                  <MessageStatusIndicator
                    message={msg}
                    loginUser={loginUser}
                    activeConversation={activeConversation}
                    receiptsEnabled={receiptsEnabled}
                    lastOwnDeliveredSequence={lastOwnDeliveredSequence}
                    groupReadState={groupReadState}
                    onRetry={onRetryMessage}
                  />
                </span>
              </div>
            </>
          )}
        </div>

        <ReactionCapsules
          reactions={msg.reactions}
          currentUserId={loginUser.userId}
          isOwn={isSelf}
          onOpenDetail={() => onOpenReactionDetail(msg.client_message_id)}
        />

        {isSelf && msg.status === -1 && !isBlockedFailure && failureText ? (
          <div
            style={{
              marginTop: 2,
              fontSize: 12,
              color: "#d4380d",
              maxWidth: "100%",
              wordBreak: "break-word"
            }}
          >
            {failureText}
          </div>
        ) : null}
      </div>
    </div>
  );

  const blockedFailureNotice =
    isBlockedFailure && failureText ? (
      <div className="im-system-message">
        <div className="im-blocked-send-notice">{failureText}</div>
      </div>
    ) : null;

  const dateSeparatorNode = dateSeparatorLabel ? (
    <DateSeparator label={dateSeparatorLabel} />
  ) : null;

  // No context menu when items empty (system / recalled / unsynced) or in
  // selection mode (single-click is reserved for toggling selection).
  if (!contextMenuItems || contextMenuItems.length === 0 || isSelectionMode) {
    return (
      <Fragment>
        {dateSeparatorNode}
        {messageNode}
        {blockedFailureNotice}
      </Fragment>
    );
  }

  return (
    <Fragment>
      {dateSeparatorNode}
      <Dropdown
        trigger={["contextMenu"]}
        menu={{ items: contextMenuItems }}
        classNames={{ root: "im-message-context-menu-dropdown" }}
      >
        {messageNode}
      </Dropdown>
      {blockedFailureNotice}
    </Fragment>
  );
});
