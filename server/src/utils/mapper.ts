import type { ChatMessage } from "@mushroom/shared";
import type { MessageRecord as Message } from "../repository/models";
import { parseJsonObject } from "./json";

type BroadcastMessage = Message &
  Partial<Pick<ChatMessage, "client_message_id" | "client_conversation_id">>;

export function mapMessages(data: BroadcastMessage[]): ChatMessage[];
export function mapMessages(data: BroadcastMessage): ChatMessage;

export function mapMessages(
  data: BroadcastMessage | BroadcastMessage[]
): ChatMessage | ChatMessage[] {
  const normalizeContent = (
    content: Message["content"]
  ): Record<string, unknown> => {
    if (typeof content !== "string") {
      return content;
    }

    return parseJsonObject(content) ?? { text: content };
  };

  const convert = (item: BroadcastMessage): ChatMessage => ({
    messageClassify: "chat",
    client_message_id: item.client_message_id ?? "",
    server_message_id: String(item.id),
    type: item.type,
    server_conversation_id: item.conversation_id,
    client_conversation_id: item.client_conversation_id ?? "",
    content: normalizeContent(item.content),
    is_recalled: item.is_recalled ? 1 : 0,
    reply_to_message_id: item.reply_to_message_id ?? undefined,
    reply_to:
      item.reply_to_message_id && item.reply_to_sender_id
        ? {
            message_id: item.reply_to_message_id,
            sender_id: item.reply_to_sender_id,
            sender_nickname: item.reply_to_sender_nickname,
            text: String(
              normalizeContent(item.reply_to_content ?? {}).text ??
                "[Quoted message]"
            )
          }
        : undefined,
    sender_id: item.sender_id,
    sender_nickname: item.sender_nickname,
    sender_avatar: item.sender_avatar,
    created_at:
      item.created_at instanceof Date
        ? item.created_at.toISOString()
        : String(item.created_at),
    updated_at:
      item.updated_at instanceof Date
        ? item.updated_at.toISOString()
        : item.updated_at
          ? String(item.updated_at)
          : undefined,
    sequence: item.sequence,
    status: 0
  });

  return Array.isArray(data) ? data.map(convert) : convert(data);
}
