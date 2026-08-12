import type { ContactListItem, Conversation } from "@mushroom/shared";
import { isReadReceiptsEnabled } from "@mushroom/shared";
import {
  mobileApiBaseUrl,
  mobileAppController,
  mobileRealtimeClient
} from "../../services/app-runtime";
import { setLoggingOut } from "../../services/session-lifecycle";
import { navigateApp } from "../../navigation/app-navigation";
import type { HomeTab } from "../../types/app";
import { applyConversationDisplayFallbacks } from "../../utils/display";
import type { createMobileAccountActions } from "../../actions/account-actions";
import type { RunAction } from "../../actions/action-types";
import type { createMobileChatActions } from "../../actions/chat-actions";
import type { MobileAppState } from "../controller/useMobileAppState";
import { i18n } from "../../i18n";

type ChatActions = ReturnType<typeof createMobileChatActions>;
type AccountActions = ReturnType<typeof createMobileAccountActions>;

export function buildHomeScreenProps(params: {
  state: MobileAppState;
  chatActions: ChatActions;
  accountActions: AccountActions;
  runAction: RunAction;
}) {
  const { state, chatActions, accountActions, runAction } = params;
  // Home stays mounted underneath the native stack when Chat (or any other
  // route) is on top; we must NOT gate it on `activeConversation` here.
  // Returning `null` while a conversation is active would leave Home with
  // no content cached, and the user would see a blank frame when popping
  // back from Chat before React re-renders Home with fresh props.
  if (!state.snapshot || !state.isAuthenticated) {
    return null;
  }

  const conversations = applyConversationDisplayFallbacks({
    conversations: state.conversations,
    contacts: state.snapshot.data.contacts ?? [],
    loginUser: state.snapshot.auth.user
  });

  return {
    tab: state.tab,
    snapshot: state.snapshot,
    realtimeStatus: state.realtimeStatus,
    catchingUp: state.catchingUp,
    mobileApiBaseUrl,
    conversations,
    availableContacts: state.availableContacts,
    userPresenceByUserId: state.userPresenceByUserId,
    typersByConversationId: state.typersByConversationId,
    groupReadStateByConversation:
      state.snapshot.data.groupReadStateByConversation ?? {},
    // 已读回执是否启用；驱动 ConversationRow 的 ✓✓ 渲染兜底。
    isReceiptsEnabled: isReadReceiptsEnabled(state.privacySettings),
    pending: state.pending,
    addEntryMenuVisible: state.addEntryMenuVisible,
    onOpenAddEntryMenu: () => {
      state.setAddEntryMenuVisible(true);
    },
    onCloseAddEntryMenu: () => {
      state.setAddEntryMenuVisible(false);
    },
    onOpenAddContact: () => {
      state.setAddEntryMenuVisible(false);
      state.setAddContactVisible(true);
    },
    onOpenStartConversation: () => {
      state.setAddEntryMenuVisible(false);
      navigateApp("StartDirect");
    },
    onOpenCreateGroupConversation: () => {
      state.setAddEntryMenuVisible(false);
      navigateApp("StartGroupSelect");
    },
    onOpenQRScanner: () => {
      // T19b — Phase B placeholder; surface a toast via global status.
      state.setStatus(i18n.t("app.scanComingSoon"));
    },
    onChangeTab: (tab: HomeTab) => {
      state.setAddEntryMenuVisible(false);
      state.setTab(tab);
    },
    onOpenConversation: (conversation: Conversation) => {
      void chatActions.handleOpenConversation(conversation);
    },
    onToggleConversationMute: (conversation: Conversation) => {
      void chatActions.handleToggleConversationMute(conversation);
    },
    onDeleteConversation: (conversation: Conversation) => {
      chatActions.handleDeleteConversation(conversation);
    },
    onToggleConversationArchive: (conversation: Conversation) => {
      void chatActions.handleToggleConversationArchive(conversation);
    },
    onToggleConversationRead: (conversation: Conversation) => {
      void chatActions.handleToggleConversationRead(conversation);
    },
    onToggleConversationPin: (conversation: Conversation) => {
      void chatActions.handleToggleConversationPin(conversation);
    },
    onOpenContactProfile: (contact: ContactListItem) => {
      navigateApp("PeerProfile", {
        userId: Number(contact.user_id),
        fallbackNickname: contact.nickname || contact.username || "",
        fallbackAvatar: contact.avatar_url || null
      });
    },
    onSyncNow: () =>
      void runAction(
        "",
        async () => {
          await mobileAppController.syncNow();
          await mobileRealtimeClient.connect();
        },
        ""
      ),
    onRefreshMeData: () => {
      void accountActions.refreshMeData();
    },
    onOpenWorkspaceSearch: () => {
      navigateApp("WorkspaceSearch");
    },
    onOpenAttachmentCenter: () => {
      state.setAttachmentCenterVisible(true);
      void chatActions.loadAttachmentCenter();
    },
    onLogout: (options?: { wipeLocalData?: boolean }) =>
      void runAction(
        i18n.t("app.loggingOutClearingCache"),
        async () => {
          setLoggingOut(true);
          try {
            await mobileAppController.logout({
              wipeLocalData: options?.wipeLocalData === true
            });
            accountActions.resetToLoggedOutState();
          } finally {
            setLoggingOut(false);
          }
        },
        i18n.t("app.loggedOut")
      )
  };
}
