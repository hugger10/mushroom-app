import type { UserSearchResult } from "@mushroom/shared";

export interface DirectChatSearchUser {
  user_id: number;
  username: string;
  nickname: string;
  avatar_url?: string;
}

export function mapUserSearchResults(
  users: UserSearchResult[]
): DirectChatSearchUser[] {
  return users.map(item => ({
    user_id: item.user_id,
    username: item.username,
    nickname: item.nickname,
    avatar_url: item.avatar_url
  }));
}
