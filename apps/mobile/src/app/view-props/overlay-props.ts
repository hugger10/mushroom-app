import { Alert } from "react-native";
import type { createMobileAccountActions } from "../../actions/account-actions";
import type { createMobileCallActions } from "../../actions/call-actions";
import type { createMobileChatActions } from "../../actions/chat-actions";
import { saveToAlbum } from "../../platform/save-to-album";
import type { MobileAppState } from "../controller/useMobileAppState";
import { sameUserId } from "../../utils/app-ui";
import type { ConversationMember } from "@mushroom/shared";
import { i18n } from "../../i18n";

type ChatActions = ReturnType<typeof createMobileChatActions>;
type CallActions = ReturnType<typeof createMobileCallActions>;
type AccountActions = ReturnType<typeof createMobileAccountActions>;

/**
 * Resolve a group conversation's members into a user_id → display-info map so
 * call tiles can show real nicknames and avatars instead of bare "用户 {id}".
 * Prefers the local contact remark, then the member nickname.
 */
function buildGroupMemberDisplayMap(state: MobileAppState) {
  const session = state.callSession;
  if (!session) {
    return new Map<number, { nickname: string; avatarUrl: string | null }>();
  }
  const conversation = state.conversations.find(
    item =>
      item.server_conversation_id === session.conversation_id ||
      item.client_conversation_id === session.conversation_id
  );
  const map = new Map<number, { nickname: string; avatarUrl: string | null }>();
  for (const member of conversation?.members ?? []) {
    const contact = state.friends.find(friend =>
      sameUserId(friend.user_id, member.user_id)
    );
    map.set(Number(member.user_id), {
      nickname:
        contact?.remark_name ||
        contact?.nickname ||
        member.nickname ||
        i18n.t("display.unknownUser", { id: member.user_id }),
      avatarUrl:
        contact?.avatar_url || member.avatar_url || member.avatar || null
    });
  }
  return map;
}

/** The conversation whose member picker is open, or null. */
function getMemberPickerConversation(state: MobileAppState) {
  if (!state.callMemberPickerConversationId) {
    return null;
  }
  return (
    state.conversations.find(
      item =>
        item.server_conversation_id === state.callMemberPickerConversationId ||
        item.client_conversation_id === state.callMemberPickerConversationId
    ) ?? null
  );
}

function toPickerMember(
  member: ConversationMember,
  state: MobileAppState
): {
  user_id: number;
  nickname: string;
  avatar_url?: string | null;
} {
  const contact = state.friends.find(friend =>
    sameUserId(friend.user_id, member.user_id)
  );
  return {
    user_id: Number(member.user_id),
    nickname:
      contact?.remark_name ||
      contact?.nickname ||
      member.nickname ||
      i18n.t("display.unknownUser", { id: member.user_id }),
    avatar_url: contact?.avatar_url || member.avatar_url || member.avatar
  };
}

export function buildOverlayProps(params: {
  state: MobileAppState;
  chatActions: ChatActions;
  accountActions: AccountActions;
  callActions: CallActions;
}) {
  const { state, chatActions, callActions } = params;

  return {
    avatarPreview: {
      visible: state.avatarPreviewVisible,
      avatarUrl: state.avatarPreviewUrl,
      fallbackLabel: state.avatarPreviewLabel,
      onClose: () => {
        state.setAvatarPreviewVisible(false);
      }
    },
    imagePreview: {
      previewKey: state.previewKey,
      images: state.previewImageList ?? [],
      currentIndex: state.previewImageIndex,
      onClose: () => state.clearPreviewImage(),
      onNavigate: (index: number) => {
        const list = state.previewImageList;
        if (!list || index < 0 || index >= list.length) return;
        const direction = index > state.previewImageIndex ? 1 : -1;
        state.navigatePreviewImage(direction);
      },
      onUrlRefreshed: (index: number, nextUrl: string) =>
        state.updatePreviewImageUrl(index, nextUrl),
      onSaveToAlbum: async (uri: string) => {
        const result = await saveToAlbum(uri);
        if (result.success) {
          state.setStatus(i18n.t("app.savedImageToAlbum"));
        } else {
          Alert.alert(i18n.t("app.saveFailed"), result.error);
        }
      }
    },
    videoPreview: {
      previewVideoUrl: state.previewVideo?.uri ?? null,
      uploadId: state.previewVideo?.uploadId ?? null,
      messageId: state.previewVideo?.messageId ?? null,
      onClose: () => {
        state.setPreviewVideo(null);
      },
      onSaveToAlbum: async (uri: string) => {
        const result = await saveToAlbum(uri);
        if (result.success) {
          state.setStatus(i18n.t("app.savedVideoToAlbum"));
        } else {
          Alert.alert(i18n.t("app.saveFailed"), result.error);
        }
      }
    },
    addContactSheet: {
      visible: state.addContactVisible,
      onClose: () => state.setAddContactVisible(false),
      onOpenQRScanner: () => {
        // T19b — Phase B placeholder: the real native scanner is not wired
        // up yet. Close the sheet and surface a toast via the global status
        // channel so users get explicit feedback instead of a fake flow.
        state.setAddContactVisible(false);
        state.setStatus(i18n.t("app.scanComingSoon"));
      }
    },
    attachmentCenter: {
      visible: state.attachmentCenterVisible,
      pending: state.pending,
      attachmentTab: state.attachmentTab,
      attachmentItems: state.attachmentItems,
      onRefresh: () => {
        void chatActions.loadAttachmentCenter();
      },
      onClose: () => state.setAttachmentCenterVisible(false),
      onChangeTab: state.setAttachmentTab,
      onOpenResult: (
        result: Parameters<typeof chatActions.handleOpenAttachmentResult>[0],
        previewMedia?: boolean
      ) => {
        void chatActions.handleOpenAttachmentResult(result, previewMedia);
      }
    },
    call: {
      callSession: state.callSession,
      localCallStreamUrl: state.localCallStreamUrl,
      remoteCallStreamUrl: state.remoteCallStreamUrl,
      callIceInfo: state.callIceInfo,
      callRoomInfo: state.callRoomInfo,
      groupParticipantMedia: state.groupParticipantMedia,
      groupLocalSpeaking: state.groupLocalSpeaking,
      currentUserId: state.snapshot?.auth.user?.userId,
      groupMemberDisplayMap: buildGroupMemberDisplayMap(state),
      onEndCall: () => {
        void callActions.handleEndCall();
      },
      onClose: state.dismissCallSessionNow,
      onToggleLocalMedia: (kind: "audio" | "video") => {
        void callActions.handleToggleLocalCallMedia(kind);
      },
      onRejectCall: () => {
        void callActions.handleRejectCall();
      },
      onAcceptCall: () => {
        void callActions.handleAcceptCall();
      }
    },
    callMemberPicker: {
      visible: state.callMemberPickerVisible,
      mediaType: state.callMemberPickerMediaType,
      members: (getMemberPickerConversation(state)?.members ?? []).map(member =>
        toPickerMember(member, state)
      ),
      currentUserId: state.snapshot?.auth.user?.userId,
      onClose: () => state.setCallMemberPickerVisible(false),
      onStartCall: (targetUserIds: number[]) => {
        const conversation = getMemberPickerConversation(state);
        if (!conversation) {
          return;
        }
        void callActions.handleStartCall(
          conversation,
          state.callMemberPickerMediaType,
          {
            targetUserIds
          }
        );
      }
    }
  };
}
