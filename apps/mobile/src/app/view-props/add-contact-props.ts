import type { createMobileAccountActions } from "../../actions/account-actions";
import type { createMobileChatActions } from "../../actions/chat-actions";
import type { AddContactProps } from "../../features/add-contact";
import { navigateApp } from "../../navigation/app-navigation";
import type { MobileAppState } from "../controller/useMobileAppState";

type ChatActions = ReturnType<typeof createMobileChatActions>;
type AccountActions = ReturnType<typeof createMobileAccountActions>;

export function buildAddContactProps(params: {
  state: MobileAppState;
  chatActions: ChatActions;
  accountActions: AccountActions;
}): AddContactProps {
  const { chatActions, accountActions, state } = params;
  return {
    pending: state.pending,
    addressBookMatches: state.addressBookMatches,
    addressBookPermission: state.addressBookPermission,
    addressBookSyncing: state.addressBookSyncing,
    onLookupByPhone: input =>
      accountActions.lookupContactByPhone({
        phoneE164: input.phoneE164,
        defaultCountryCode: input.defaultCountryCode
      }),
    onSearchUsers: (keyword: string, options) =>
      accountActions.searchUsers(keyword, options),
    onAddContact: input =>
      accountActions.addContact({
        userId: input.userId,
        remarkName: input.remarkName,
        source: input.source
      }),
    onOpenChatByUserId: async (userId: number) => {
      await chatActions.handleOpenConversationByUserId(userId);
    },
    onOpenContactProfile: input => {
      navigateApp("PeerProfile", {
        userId: input.userId,
        fallbackNickname: input.nickname,
        fallbackAvatar: input.avatarUrl
      });
    },
    onRefreshAddressBookMatches: () => {
      void accountActions.refreshAddressBookMatches();
    },
    onSaveAddressBookContact: entry => {
      void accountActions.saveAddressBookContact(entry);
    },
    onOpenAddressBookConversation: entry => {
      navigateApp("PeerProfile", {
        userId: Number(entry.matched_user_id),
        fallbackNickname: entry.nickname || entry.username,
        fallbackAvatar: entry.avatar_url || null
      });
    }
  };
}
