import type {
  ContactListItem,
  Conversation,
  Message,
  MessageStateRecord
} from "@mushroom/shared";
import {
  calculateConversationCutoff as calculateConversationCutoffShared,
  recomputeConversationSyncProgress
} from "@mushroom/app-core";

/**
 * 这些是从 `sqlite-data-repository.ts` 顶层平移过来的**纯**辅助：
 * 不依赖 DB 句柄，仅做内存对象上的归一化 / 排序 / 浅克隆，方便子模块复用。
 * 行为与签名保持原文件字面一致；如需扩展请在子模块就近实现，不要污染本文件。
 */

export function safeJsonParse<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || value.length === 0) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function cloneContact(contact: ContactListItem): ContactListItem {
  return { ...contact };
}

export function cloneConversation(conversation: Conversation): Conversation {
  return {
    ...conversation,
    members: conversation.members?.map(member => ({ ...member }))
  };
}

export function cloneMessage(message: Message): Message {
  return { ...message };
}

export function getContactSortName(contact: ContactListItem) {
  return String(contact.remark_name || contact.nickname || contact.username);
}

export function getConversationHiddenFloor(conversation: Conversation) {
  return Number(conversation.local_hidden_before_seq ?? 0);
}

export function isMessageVisibleForConversation(
  message: Message,
  hiddenFloor: number
) {
  const sequence = Number(message.sequence || 0);
  return sequence <= 0 || sequence > hiddenFloor;
}

export function compareMessagesForTimeline(left: Message, right: Message) {
  const leftSequence = Number(left.sequence || 0);
  const rightSequence = Number(right.sequence || 0);

  if (leftSequence > 0 && rightSequence > 0 && leftSequence !== rightSequence) {
    return leftSequence - rightSequence;
  }

  const createdAtCompare = String(left.created_at || "").localeCompare(
    String(right.created_at || "")
  );
  if (createdAtCompare !== 0) {
    return createdAtCompare;
  }

  return String(left.client_message_id || "").localeCompare(
    String(right.client_message_id || "")
  );
}

export function limitTimelineMessages(messages: Message[], limit?: number) {
  if (!limit || limit <= 0 || messages.length <= limit) {
    return messages;
  }

  return messages.slice(-limit);
}

export function calculateConversationCutoff(
  conversation: Conversation,
  messages: Message[]
) {
  return calculateConversationCutoffShared(conversation, messages);
}

export function recomputeConversationProgress(
  conversation: Conversation,
  messages: Message[]
): Conversation {
  return recomputeConversationSyncProgress(conversation, messages);
}

export function sortConversations(items: Conversation[]) {
  return [...items].sort((left, right) => {
    const archivedDiff =
      Number(left.is_archived || 0) - Number(right.is_archived || 0);
    if (archivedDiff !== 0) {
      return archivedDiff;
    }

    const pinnedDiff =
      Number(right.is_pinned || 0) - Number(left.is_pinned || 0);
    if (pinnedDiff !== 0) {
      return pinnedDiff;
    }

    return String(right.last_message_time || "").localeCompare(
      String(left.last_message_time || "")
    );
  });
}

export function applyMessageState(message: Message, state: MessageStateRecord) {
  return {
    ...message,
    is_favorited: state.is_favorited,
    is_pinned: state.is_pinned,
    updated_at: state.updated_at
  };
}
