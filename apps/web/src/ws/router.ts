import type { AnyWsMessage } from "./types";
import { handleChatMessage } from "./handlers/chatHandler";
import { handleConversationSyncMessage } from "./handlers/conversationSyncHandler";
import { handleAckMessage } from "./handlers/ackHandler";
import { handleConversationReadMessage } from "./handlers/conversationReadHandler";
import { handleGroupReadMessage } from "./handlers/groupReadHandler";
import { handleMessageRecallMessage } from "./handlers/messageRecallHandler";
import { handleMessageReactionMessage } from "./handlers/messageReactionHandler";
import { handlePongMessage } from "./handlers/pongHandler";
import {
  handleContactChangedMessage,
  handleBlockChangedMessage
} from "./handlers/contactChangeHandler";
import { handleAttachmentUpdatedMessage } from "./handlers/attachmentUpdatedHandler";
import { handlePrivacySyncMessage } from "./handlers/privacySyncHandler";

export function routeMessage(message: AnyWsMessage) {
  switch (message.messageClassify) {
    case "chat":
      handleChatMessage(message);
      break;
    case "ack":
      handleAckMessage(message);
      break;
    case "presence":
    case "presence.snapshot":
    case "message_error":
    case "typing":
      // Presence (incl. snapshot) and typing are ephemeral UI state handled by hook subscribers.
      break;
    case "conversation_read":
      handleConversationReadMessage(message);
      break;
    case "group_read":
      void handleGroupReadMessage(message);
      break;
    case "conversation_sync":
      void handleConversationSyncMessage(message);
      break;
    case "message_recall":
      handleMessageRecallMessage(message);
      break;
    case "message_reaction":
      void handleMessageReactionMessage(message);
      break;
    case "pong":
      handlePongMessage(message);
      break;
    case "contact_changed":
      void handleContactChangedMessage(message);
      break;
    case "block_changed":
      void handleBlockChangedMessage(message);
      break;
    case "attachment_updated":
      void handleAttachmentUpdatedMessage(message);
      break;
    case "privacy_sync":
      handlePrivacySyncMessage(message);
      break;
    case "call.invited":
    case "call.ringing":
    case "call.accepted":
    case "call.rejected":
    case "call.busy":
    case "call.timeout":
    case "call.ended":
    case "call.state-sync":
    case "call.media-state":
    case "offer":
    case "answer":
    case "ice":
      break;
    default:
      console.warn("未知消息类型:", message);
  }
}
