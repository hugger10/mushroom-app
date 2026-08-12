import type { ConversationSyncMessage } from "@mushroom/shared";
import { BusinessError } from "../../handler/business_error";
import ConversationCoreRepository, {
  type DbTx
} from "../../repository/conversation/conversation_core_repository";
import ConversationMemberRepository from "../../repository/conversation/conversation_member_repository";
import ConversationReadStateRepository from "../../repository/conversation/conversation_read_state_repository";
import type {
  ConversationMemberRecord as ConversationMember,
  ConversationRecord as Conversation,
  MessageRecord
} from "../../repository/models";
import OutboxRepository from "../../repository/outbox_repository";
import { mapMessages } from "../../utils/mapper";

export async function getGroupContext(
  t: DbTx,
  conversationId: string,
  userId: number
) {
  const conversation = await ConversationCoreRepository.findById(
    conversationId,
    t
  );
  if (!conversation) {
    throw new BusinessError("Conversation not found");
  }
  if (conversation.type !== 2) {
    throw new BusinessError("Only group conversations support this action");
  }

  const actorMember = await ConversationMemberRepository.findMember(
    t,
    conversationId,
    userId
  );
  if (!actorMember) {
    throw new BusinessError(
      "User is not an active member of this conversation"
    );
  }

  const members = await ConversationMemberRepository.findMembersByConversation(
    t,
    conversationId
  );

  return {
    conversation,
    actorMember,
    members
  };
}

export async function finishGroupMutation(
  t: DbTx,
  params: {
    conversation: Conversation;
    actorUserId: number;
    members: ConversationMember[];
    messages: MessageRecord[];
    readUserIds?: number[];
  }
) {
  const lastMessage = params.messages[params.messages.length - 1];
  if (!lastMessage) {
    return;
  }

  await ConversationCoreRepository.updateConversationPointers(t, {
    conversationId: params.conversation.id,
    lastMessageId: lastMessage.id,
    lastMessageAt: lastMessage.created_at
  });

  const readUserIds = new Set([
    params.actorUserId,
    ...(params.readUserIds ?? [])
  ]);

  if (params.members.length > 0) {
    await ConversationReadStateRepository.upsertConversationUserStates(
      t,
      params.members.map(member => ({
        conversation_id: params.conversation.id,
        user_id: member.user_id,
        is_pinned: false,
        is_muted: false,
        is_archived: false,
        draft: null,
        hidden_before_seq: 0,
        last_read_seq: readUserIds.has(member.user_id)
          ? lastMessage.sequence
          : 0,
        last_delivered_seq: lastMessage.sequence,
        unread_count: readUserIds.has(member.user_id)
          ? 0
          : Math.max(lastMessage.sequence, 0),
        peer_id: 0,
        settings: null
      }))
    );
  }

  await OutboxRepository.insertEvents(
    t,
    params.messages.flatMap(message =>
      params.members.map(member => ({
        event_type: "chat.message.deliver",
        message_id: String(message.id),
        conversation_id: params.conversation.id,
        target_user_id: member.user_id,
        payload: mapMessages({
          ...message,
          client_message_id: message.client_message_id ?? undefined
        })
      }))
    )
  );

  await OutboxRepository.insertEvents(
    t,
    params.members.map(member => ({
      event_type: "conversation.sync",
      conversation_id: params.conversation.id,
      target_user_id: member.user_id,
      payload: {
        messageClassify: "conversation_sync" as const,
        action: "upsert" as const,
        conversation_id: params.conversation.id
      } satisfies ConversationSyncMessage
    }))
  );
}
