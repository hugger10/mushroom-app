import type {
  CallAcceptedMessage,
  CallBusyMessage,
  CallEndedMessage,
  CallInvitedMessage,
  CallRejectedMessage,
  CallStateSyncMessage,
  CallTimeoutMessage
} from "@mushroom/shared";
import type { CallUiSession, Conversation } from "../../types/chat";
import { sameUserId } from "../useChatHelpers";
import { i18n } from "../../i18n";

export type CallSessionLifecycleMessage =
  | CallAcceptedMessage
  | CallInvitedMessage
  | CallStateSyncMessage
  | CallRejectedMessage
  | CallBusyMessage
  | CallTimeoutMessage
  | CallEndedMessage;

export function hasParticipantList(
  payload: CallSessionLifecycleMessage
): payload is CallInvitedMessage | CallStateSyncMessage {
  return "participants" in payload;
}

export function resolveCallConversationLabel(
  conversations: Conversation[],
  conversationId: string
) {
  const conversation = conversations.find(
    item =>
      item.server_conversation_id === conversationId ||
      item.client_conversation_id === conversationId
  );

  return (
    conversation?.display_name ||
    conversation?.name ||
    i18n.t("ui.callOverlay.call")
  );
}

export function getCallTargetUserIds(
  conversation: Conversation,
  loginUserId?: number
) {
  const memberIds = new Set<number>();
  for (const member of conversation.members ?? []) {
    if (member.user_id !== loginUserId) {
      memberIds.add(member.user_id);
    }
  }

  if (conversation.type === 1 && conversation.peer_id) {
    memberIds.add(conversation.peer_id);
  }

  return Array.from(memberIds);
}

export function resolveCallParticipantDisplayName(options: {
  conversations: Conversation[];
  conversationId: string;
  userId: number | null;
  deviceId: string | null;
  participantName?: string;
}) {
  const conversation = options.conversations.find(
    item =>
      item.server_conversation_id === options.conversationId ||
      item.client_conversation_id === options.conversationId
  );
  const conversationMember = conversation?.members?.find(member =>
    options.userId === null ? false : sameUserId(member.user_id, options.userId)
  );

  return (
    conversationMember?.nickname ||
    options.participantName ||
    (options.userId !== null
      ? i18n.t("display.unknownUser", { id: options.userId })
      : null) ||
    (options.deviceId
      ? i18n.t("callActions.deviceFallback", { id: options.deviceId })
      : null) ||
    i18n.t("callActions.memberFallback")
  );
}

export function getRemoteCallParticipant(options: {
  session: CallUiSession | null;
  loginUserId?: number;
  preferredDeviceId?: string;
}) {
  if (options.session === null || options.loginUserId == null) {
    return null;
  }

  const candidates = options.session.participants.filter(
    participant => !sameUserId(participant.user_id, options.loginUserId)
  );
  if (options.preferredDeviceId) {
    return (
      candidates.find(
        participant => participant.device_id === options.preferredDeviceId
      ) ??
      candidates[0] ??
      null
    );
  }

  return candidates[0] ?? null;
}

export function getLocalCallParticipant(options: {
  session: CallUiSession | null;
  loginUserId?: number;
  currentDeviceId: string | null;
}) {
  if (options.session === null || options.loginUserId == null) {
    return null;
  }

  const candidates = options.session.participants.filter(participant =>
    sameUserId(participant.user_id, options.loginUserId)
  );
  if (options.currentDeviceId) {
    return (
      candidates.find(
        participant => participant.device_id === options.currentDeviceId
      ) ??
      candidates[0] ??
      null
    );
  }

  return candidates[0] ?? null;
}
