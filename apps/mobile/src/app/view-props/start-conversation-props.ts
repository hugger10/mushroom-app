import type { UserSearchResult } from "@mushroom/shared";
import type { createMobileAccountActions } from "../../actions/account-actions";
import type { createMobileChatActions } from "../../actions/chat-actions";
import type { StartConversationProps } from "../../features/start-conversation";
import type { MobileAppState } from "../controller/useMobileAppState";

type ChatActions = ReturnType<typeof createMobileChatActions>;
type AccountActions = ReturnType<typeof createMobileAccountActions>;

export function buildStartConversationProps(params: {
  state: MobileAppState;
  chatActions: ChatActions;
  accountActions: AccountActions;
}): StartConversationProps {
  const { state, chatActions, accountActions } = params;
  return {
    availableContacts: state.availableContacts,
    onSearchUsers: (keyword: string): Promise<UserSearchResult[]> =>
      accountActions.searchUsers(keyword),
    onOpenChatByUserId: async (userId: number) => {
      await chatActions.handleOpenConversationByUserId(userId);
    },
    onStartDirectConversation: async (userId: number) => {
      await accountActions.startDirectConversation(userId);
      await chatActions.handleOpenConversationByUserId(userId);
    },
    onCreateGroupConversation: async input => {
      const conversation =
        await accountActions.handleCreateGroupConversation(input);
      // Per UX decision T4: do NOT auto-open chat after creation; user returns
      // to Home and can open the new group from the list.
      if (!conversation) {
        state.setStatus("");
      }
    }
  };
}
