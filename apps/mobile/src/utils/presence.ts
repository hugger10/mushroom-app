import type { ContactListItem, Conversation } from "@mushroom/shared";
export {
  mergePresenceSummary,
  PRESENCE_DIRECT_CHAT_STALE_MS,
  shouldRefreshPresence
} from "@mushroom/shared";

export const PRESENCE_HOME_CHAT_LIMIT = 10;
export const PRESENCE_HOME_FRIEND_LIMIT = 6;
export const PRESENCE_HOME_LIST_STALE_MS = 2 * 60 * 1000;
export function collectHomePresenceUserIds(options: {
  conversations: Conversation[];
  friends: ContactListItem[];
}) {
  const seen = new Set<number>();
  const userIds: number[] = [];

  const directConversations = options.conversations
    .filter(item => item.type === 1)
    .sort((left, right) => {
      const leftTime = new Date(left.last_message_time || 0).getTime();
      const rightTime = new Date(right.last_message_time || 0).getTime();
      return rightTime - leftTime;
    });

  for (const conversation of directConversations) {
    const userId = Number(conversation.peer_id || 0);
    if (!Number.isFinite(userId) || userId <= 0 || seen.has(userId)) {
      continue;
    }

    seen.add(userId);
    userIds.push(userId);
    if (userIds.length >= PRESENCE_HOME_CHAT_LIMIT) {
      break;
    }
  }

  let extraFriendCount = 0;
  for (const friend of options.friends) {
    if (extraFriendCount >= PRESENCE_HOME_FRIEND_LIMIT) {
      break;
    }

    const userId = Number(friend.user_id || 0);
    if (!Number.isFinite(userId) || userId <= 0 || seen.has(userId)) {
      continue;
    }

    seen.add(userId);
    userIds.push(userId);
    extraFriendCount += 1;
  }

  return userIds;
}
