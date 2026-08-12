import type { createMobileAccountActions } from "../../actions/account-actions";
import type { createMobileChatActions } from "../../actions/chat-actions";
import type {
  PeerProfileDerived,
  PeerProfileProps
} from "../../features/peer-profile";
import { popToChat } from "../../navigation/app-navigation";
import type { MobileAppState } from "../controller/useMobileAppState";

type ChatActions = ReturnType<typeof createMobileChatActions>;
type AccountActions = ReturnType<typeof createMobileAccountActions>;

export function buildPeerProfileProps(params: {
  state: MobileAppState;
  chatActions: ChatActions;
  accountActions: AccountActions;
}): PeerProfileProps {
  const { state, chatActions, accountActions } = params;

  function getDerived(userId: number): PeerProfileDerived {
    const blockedContact =
      userId > 0
        ? (state.blockedContacts.find(
            contact => Number(contact.user_id) === Number(userId)
          ) ?? null)
        : null;
    const peerContact =
      userId > 0
        ? (state.contacts.find(
            contact => Number(contact.user_id) === Number(userId)
          ) ?? null)
        : null;
    const peerConversation =
      userId > 0
        ? (state.conversations.find(
            conv => conv.type === 1 && Number(conv.peer_id) === Number(userId)
          ) ?? null)
        : null;
    const resolvedFallbackNickname =
      peerContact?.nickname ||
      blockedContact?.nickname ||
      peerConversation?.peer_nickname ||
      blockedContact?.username ||
      peerConversation?.display_name ||
      peerConversation?.name ||
      "";
    const resolvedFallbackUsername =
      peerContact?.username ||
      blockedContact?.username ||
      peerConversation?.peer_username ||
      null;
    const resolvedFallbackAvatar =
      peerContact?.avatar_url ??
      blockedContact?.avatar_url ??
      peerConversation?.display_avatar ??
      peerConversation?.avatar_url ??
      null;
    return {
      isContact: Boolean(peerContact),
      isBlocked: Boolean(blockedContact),
      peerConversation,
      initialRemarkName: peerContact?.remark_name ?? "",
      resolvedFallbackNickname,
      resolvedFallbackUsername,
      resolvedFallbackAvatar
    };
  }

  async function resolveConversationByUserId(userId: number) {
    if (userId <= 0) {
      return null;
    }
    let conversation = await chatActions.handleOpenConversationByUserId(userId);
    if (conversation) {
      return conversation;
    }
    await accountActions.startDirectConversation(userId);
    conversation = await chatActions.handleOpenConversationByUserId(userId);
    return conversation;
  }

  return {
    getDerived,
    onLoadProfile: async (userId: number) => {
      const result = await accountActions.getUserProfile(userId);
      return result;
    },
    onOpenChat: async (userId: number) => {
      if (userId <= 0) {
        return;
      }
      const conversation = await resolveConversationByUserId(userId);
      if (!conversation) {
        return;
      }
      // 显式回退到栈中已有的 Chat 屏，避免依赖 wantsChat effect
      // ——当目标 conversation 与当前 activeConversation 相同时，effect 因依赖
      // 未变化不会重跑，路由会卡在 PeerProfile。
      popToChat();
    },
    onOpenSearchInChat: async (userId: number) => {
      if (userId <= 0) {
        return;
      }
      const conversation = await resolveConversationByUserId(userId);
      if (!conversation) {
        return;
      }
      await chatActions.handleOpenConversation(conversation);
      state.setSearchKeyword("");
      state.setSearchFilter("text");
      state.setHighlightedMessageId(null);
      state.setIsSearchVisible(true);
      popToChat();
    },
    onSaveContactRemark: async (input: {
      userId: number;
      remarkName: string;
    }) => {
      await accountActions.handleUpdateContactRemark(input);
    },
    onDeleteContact: async (userId: number, displayName?: string) => {
      accountActions.handleDeleteContact(userId, displayName);
    },
    onBlockUser: async (userId: number, displayName?: string) => {
      if (userId <= 0) {
        return;
      }
      await accountActions.handleBlockUser(userId, displayName);
    },
    onUnblockUser: async (userId: number, displayName?: string) => {
      if (userId <= 0) {
        return;
      }
      await accountActions.handleUnblockUser(userId, displayName);
    },
    onAddAsContact: async (input: { userId: number }) => {
      if (!input.userId || input.userId <= 0) {
        return;
      }
      await accountActions.addContact({
        userId: input.userId,
        source: "profile"
      });
    },
    onPressAvatar: (input: { avatarUrl?: string | null; label?: string }) => {
      state.setAvatarPreviewUrl(input.avatarUrl ?? null);
      state.setAvatarPreviewLabel(input.label ?? "");
      state.setAvatarPreviewVisible(true);
    },
    onClearConversation: (userId: number) => {
      const conv = getDerived(userId).peerConversation;
      if (conv) {
        chatActions.handleClearConversation(conv);
      }
    },
    onToggleMute: (userId: number) => {
      const conv = getDerived(userId).peerConversation;
      if (conv) {
        void chatActions.handleToggleConversationMute(conv);
      }
    },
    onTogglePin: (userId: number) => {
      const conv = getDerived(userId).peerConversation;
      if (conv) {
        void chatActions.handleToggleConversationPin(conv);
      }
    }
  };
}
