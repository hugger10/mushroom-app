import type { Conversation, Message } from "../../../types/chat";
import type { LoginUser } from "../../../types/user";
import {
  getConversationUserDisplayName,
  type ContactsLookup
} from "../../../utils/display";

interface ReplyQuoteBlockProps {
  message: Message;
  activeConversation: Conversation;
  loginUser: LoginUser;
  contacts?: ContactsLookup;
  onJumpToReply: (serverMessageId: string) => void;
}

/**
 * Quoted-reply block rendered inside a bubble. Clicking jumps to the
 * referenced message. Renders nothing when there is no reply reference.
 */
export function ReplyQuoteBlock({
  message,
  activeConversation,
  loginUser,
  contacts,
  onJumpToReply
}: ReplyQuoteBlockProps) {
  if (!message.reply_to) {
    return null;
  }

  const replyMessageId =
    message.reply_to_message_id ||
    (typeof message.reply_to === "object" &&
    message.reply_to !== null &&
    "message_id" in message.reply_to
      ? (message.reply_to as { message_id?: string }).message_id
      : null);

  const isSelf = message.sender_id === loginUser.userId;

  return (
    <div
      className={`im-reply-block ${
        isSelf ? "im-reply-block-self" : "im-reply-block-other"
      }`}
      onClick={() => {
        if (replyMessageId) {
          onJumpToReply(replyMessageId);
        }
      }}
    >
      <div
        className={`im-reply-author ${
          isSelf ? "im-reply-author-self" : "im-reply-author-other"
        }`}
      >
        {getConversationUserDisplayName(
          activeConversation,
          loginUser,
          message.reply_to.sender_id,
          message.reply_to.sender_nickname,
          contacts
        )}
      </div>
      <div
        className={`im-reply-text ${
          isSelf ? "im-reply-text-self" : "im-reply-text-other"
        }`}
      >
        {message.reply_to.text}
      </div>
    </div>
  );
}
