import { useEffect } from "react";
import { computeTotalUnread } from "@mushroom/shared";
import type { Conversation } from "../../types/chat";
import { getConversationLabel } from "../useChatHelpers";

type UseChatTitleOptions = {
  appTitle: string;
  activeConversation: Conversation | undefined;
  conversations: Conversation[];
};

export function useChatTitle({
  appTitle,
  activeConversation,
  conversations
}: UseChatTitleOptions) {
  useEffect(() => {
    // Title prefix historically counts every conversation (including muted),
    // so keep `excludeMuted: false` here; the mobile app-icon badge uses the
    // default muted-excluding behavior instead.
    const totalUnread = computeTotalUnread(conversations, {
      excludeMuted: false
    });
    const totalMentions = conversations.reduce(
      (sum, conversation) =>
        sum + Number(conversation.mention_unread_count || 0),
      0
    );
    const activeConversationLabel = getConversationLabel(activeConversation);
    const unreadPrefix = totalUnread > 0 ? `(${totalUnread}) ` : "";
    const mentionPrefix = totalMentions > 0 ? "[@] " : "";
    document.title = activeConversationLabel
      ? `${unreadPrefix}${mentionPrefix}${activeConversationLabel} - ${appTitle}`
      : `${unreadPrefix}${mentionPrefix}${appTitle}`;
  }, [activeConversation, appTitle, conversations]);

  useEffect(() => {
    return () => {
      document.title = appTitle;
    };
  }, [appTitle]);
}
