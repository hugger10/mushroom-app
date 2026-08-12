import { computeExponentialBackoffMs } from "@mushroom/shared";
import type { Message, Conversation } from "./../types/chat";
import type { ContactListItem, LoginUser } from "../types/user";
import { getMessageDisplayName } from "../utils/display";

export {
  applyConversationsPatch,
  applyMessagesPatch,
  mergeMessageLists
} from "./messagePatch";

const RETRY_BASE_DELAY_MS = 2000;

export function computeNextRetryAt(retryCount: number) {
  const delay = computeExponentialBackoffMs(retryCount, {
    baseDelayMs: RETRY_BASE_DELAY_MS,
    exponentOffset: -1
  });
  return new Date(Date.now() + delay).toISOString();
}

export function getConversationSyncState(conversation: Conversation) {
  const lastSyncSequence = Number(conversation.last_sync_sequence || 0);
  const lastServerSequence = Number(
    conversation.last_server_sequence ?? lastSyncSequence
  );
  const tailLoadedToSequence = Number(conversation.tail_loaded_to_seq || 0);
  const localHiddenBeforeSequence = Number(
    conversation.local_hidden_before_seq || 0
  );
  return {
    lastSyncSequence,
    lastServerSequence,
    tailLoadedToSequence,
    localHiddenBeforeSequence
  };
}

export function getConversationReadTargetSequence(conversation: Conversation) {
  return Math.max(
    Number(conversation.last_sync_sequence || 0),
    Number(conversation.tail_loaded_to_seq || 0),
    Number(conversation.local_hidden_before_seq || 0)
  );
}

export function deriveConversationSyncProgress(
  conversation: Conversation,
  localMessages: Message[],
  incomingSequence?: number
) {
  const { lastSyncSequence, lastServerSequence, localHiddenBeforeSequence } =
    getConversationSyncState(conversation);
  const nextServerSequence =
    Number(incomingSequence || 0) > 0
      ? Math.max(lastServerSequence, Number(incomingSequence || 0))
      : lastServerSequence;

  const pendingSequences = new Set<number>();
  for (const localMessage of localMessages) {
    const sequence = Number(localMessage.sequence || 0);
    if (sequence > Math.max(lastSyncSequence, localHiddenBeforeSequence)) {
      pendingSequences.add(sequence);
    }
  }

  let nextSyncSequence = Math.max(lastSyncSequence, localHiddenBeforeSequence);
  while (pendingSequences.has(nextSyncSequence + 1)) {
    nextSyncSequence += 1;
  }

  const tailSequences = localMessages
    .map(localMessage => Number(localMessage.sequence || 0))
    .filter(sequence => sequence > 0)
    .sort((left, right) => right - left);
  const tailLoadedToSequence = tailSequences[0] ?? 0;
  let tailLoadedFromSequence =
    tailLoadedToSequence > 0 ? tailLoadedToSequence : 0;
  for (const sequence of tailSequences.slice(1)) {
    if (sequence === tailLoadedFromSequence - 1) {
      tailLoadedFromSequence = sequence;
      continue;
    }
    break;
  }
  const nextHistoryComplete =
    nextServerSequence === 0
      ? 1
      : nextServerSequence <= localHiddenBeforeSequence
        ? 1
        : tailLoadedFromSequence > 0 &&
            tailLoadedFromSequence <= localHiddenBeforeSequence + 1
          ? 1
          : 0;
  const nextNeedsBackfill =
    nextServerSequence >
      Math.max(tailLoadedToSequence, localHiddenBeforeSequence) ||
    nextHistoryComplete === 0
      ? 1
      : 0;

  return {
    last_sync_sequence: nextSyncSequence,
    last_server_sequence: nextServerSequence,
    sync_gap_detected:
      nextServerSequence >
        Math.max(nextSyncSequence, localHiddenBeforeSequence) ||
      nextHistoryComplete === 0
        ? 1
        : 0,
    tail_loaded_from_seq: tailLoadedFromSequence,
    tail_loaded_to_seq: tailLoadedToSequence,
    history_complete: nextHistoryComplete,
    needs_backfill: nextNeedsBackfill
  };
}

export function isAppWindowVisible() {
  return document.visibilityState === "visible" && document.hasFocus();
}

export function isActiveConversationViewportShowingLatestMessage() {
  const container = document.querySelector<HTMLElement>(".im-message-scroll");
  if (!container) {
    return false;
  }

  const distanceFromBottom =
    container.scrollHeight - container.scrollTop - container.clientHeight;
  return distanceFromBottom <= 80;
}

export function sameUserId(
  left: number | string | null | undefined,
  right: number | string | null | undefined
) {
  return Number(left) === Number(right);
}

export function getConversationLabel(conversation?: Conversation) {
  return conversation?.display_name || conversation?.name || "New message";
}

export function getNotificationSenderLabel(
  message: Message,
  conversation: Conversation | undefined,
  loginUser: LoginUser | null
) {
  return getMessageDisplayName({
    message,
    conversation,
    loginUser,
    defaultLabel:
      conversation?.type === 1 ? getConversationLabel(conversation) : undefined
  });
}

export function applyConversationDisplayFallbacks(
  conversations: Conversation[],
  contacts: ContactListItem[],
  loginUser: LoginUser | null
) {
  const contactMap = new Map(
    contacts.map(contact => [contact.user_id, contact])
  );

  return conversations.map(conversation => {
    if (conversation.type !== 1) {
      return conversation;
    }

    const otherMember = conversation.members?.find(
      member => member.user_id !== loginUser?.userId
    );
    const effectivePeerId = otherMember?.user_id ?? conversation.peer_id;
    const contact = effectivePeerId
      ? contactMap.get(effectivePeerId)
      : undefined;
    const contactRemarkName = contact?.remark_name;
    const displayName =
      contactRemarkName ||
      contact?.nickname ||
      contact?.username ||
      otherMember?.nickname ||
      conversation.display_name ||
      conversation.name ||
      (effectivePeerId ? `User ${effectivePeerId}` : "Contact");
    const displayAvatar =
      contact?.avatar_url ||
      otherMember?.avatar_url ||
      conversation.display_avatar ||
      conversation.avatar_url;

    return {
      ...conversation,
      peer_id: effectivePeerId,
      display_name: displayName,
      display_avatar: displayAvatar
    };
  });
}

export function buildForwardedContent(
  message: Message,
  sourceConversation?: Conversation
): Record<string, unknown> {
  const baseContent =
    typeof message.content === "object" && message.content !== null
      ? { ...message.content }
      : { text: String(message.content ?? "") };

  return {
    ...baseContent,
    forwarded_from: {
      conversation_id: sourceConversation?.server_conversation_id,
      conversation_name:
        sourceConversation?.display_name || sourceConversation?.name,
      sender_id: message.sender_id,
      sender_nickname: message.sender_nickname,
      forwarded_at: new Date().toISOString()
    }
  };
}

export function stopMediaStream(stream: MediaStream | null) {
  if (!stream) {
    return;
  }

  for (const track of stream.getTracks()) {
    track.stop();
  }
}

export function resolveConfiguredIceServers() {
  const rawConfig = import.meta.env.VITE_CALL_ICE_SERVERS?.trim();
  if (rawConfig) {
    try {
      const parsed = JSON.parse(rawConfig) as RTCIceServer[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch (error) {
      console.warn("Failed to parse VITE_CALL_ICE_SERVERS", error);
    }
  }

  return [{ urls: "stun:stun.l.google.com:19302" }];
}

function readBooleanEnvFlag(value: string | undefined) {
  return value?.trim().toLowerCase() === "true";
}

export function shouldForceRelayTransport() {
  return readBooleanEnvFlag(import.meta.env.VITE_CALL_FORCE_RELAY);
}

export function isCallMediaDebugEnabled() {
  return readBooleanEnvFlag(import.meta.env.VITE_CALL_DEBUG_MEDIA);
}
