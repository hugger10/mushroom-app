import { useTranslation } from "react-i18next";
import {
  CloseCircleOutlined,
  ClockCircleOutlined,
  SyncOutlined
} from "@ant-design/icons";
import { hasPeerReadMessage, isGroupMessageRead } from "@mushroom/shared";
import type { Conversation, Message } from "../../../types/chat";
import type { LoginUser } from "../../../types/user";
import { canRetryFailedMessage } from "./messageListUtils";

interface MessageStatusIndicatorProps {
  message: Message;
  loginUser: LoginUser;
  activeConversation: Conversation;
  /** Whether the current user's read-receipts privacy is enabled. */
  receiptsEnabled: boolean;
  /** Highest sequence the current user has had delivered, computed at list level. */
  lastOwnDeliveredSequence: number;
  /** Group read state high-water-mark per reader user_id; null for 1:1 chats. */
  groupReadState?: Record<number, number> | null;
  /** Click handler for the failed-send retry icon. */
  onRetry: (message: Message) => void;
}

/**
 * Trailing status glyph on a sent message: spinner / pending clock /
 * retry-on-failure icon, or delivered / read ticks (for own last delivered
 * message). Returns null for incoming messages and non-finalized own messages.
 */
export function MessageStatusIndicator({
  message,
  loginUser,
  activeConversation,
  receiptsEnabled,
  lastOwnDeliveredSequence,
  groupReadState = null,
  onRetry
}: MessageStatusIndicatorProps) {
  const { t } = useTranslation();
  if (message.sender_id !== loginUser.userId) return null;

  if (message.status === 1) {
    return <SyncOutlined spin className="im-message-status-icon" />;
  }
  if (message.status === 2) {
    return (
      <ClockCircleOutlined className="im-message-status-icon im-message-status-pending" />
    );
  }
  if (canRetryFailedMessage(message)) {
    return (
      <CloseCircleOutlined
        className="im-message-status-icon im-message-status-error"
        onClick={() => onRetry(message)}
        title={message.last_error || t("chat.sendFailedRetry")}
      />
    );
  }
  if (message.status === 0) {
    // Read / delivered tick (only on the last delivered own message).
    if (Number(message.sequence || 0) <= 0) return null;
    // Privacy: when receipts disabled, never render read-tick.
    if (!receiptsEnabled) return null;

    const isLastDelivered =
      Number(message.sequence || 0) === Number(lastOwnDeliveredSequence || 0);
    if (!isLastDelivered) return null;

    const isPrivate = activeConversation.type === 1;
    const isRead = isPrivate
      ? hasPeerReadMessage(
          activeConversation.peer_last_read_sequence,
          message.sequence
        )
      : isGroupMessageRead(message.sequence, groupReadState, loginUser.userId);

    if (isRead) {
      return (
        <span
          className="im-message-read-icon"
          aria-label={t("chat.read")}
          title={t("chat.read")}
        />
      );
    }
    return (
      <span
        className="im-message-delivered-icon"
        aria-label={t("chat.delivered", "已送达")}
        title={t("chat.delivered", "已送达")}
      />
    );
  }
  return null;
}
