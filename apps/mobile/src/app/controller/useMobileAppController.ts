import { useCallback, useMemo } from "react";
import { createMobileAccountActions } from "../../actions/account-actions";
import { createMobileCallActions } from "../../actions/call-actions";
import { createMobileChatActions } from "../../actions/chat-actions";
import { mobileRealtimeClient } from "../../services/app-runtime";
import { useIsLoggingOut } from "../../services/session-lifecycle";
import { getReadableErrorMessage } from "../../utils/error-message";
import {
  buildAccountSecurityProps,
  buildAddContactProps,
  buildAuthScreenProps,
  buildChatScreenProps,
  buildGroupManageProps,
  buildHomeScreenProps,
  buildMeProps,
  buildOverlayProps,
  buildPeerProfileProps,
  buildStartConversationProps,
  buildWorkspaceSearchProps
} from "../view-props";
import { useMobileAppEffects } from "./useMobileAppEffects";
import { useMobileAppState } from "./useMobileAppState";

export function useMobileAppController() {
  const state = useMobileAppState();
  const isLoggingOut = useIsLoggingOut();

  async function runAction(
    nextStatus: string,
    action: () => Promise<unknown>,
    doneStatus: string
  ) {
    state.setPending(true);
    state.setError("");
    state.setStatus(nextStatus);
    try {
      await action();
      state.setStatus(doneStatus);
    } catch (currentError) {
      const readableError = getReadableErrorMessage(currentError);
      state.setError(readableError);
      state.setStatus(readableError);
    } finally {
      state.setPending(false);
    }
  }

  const callActions = createMobileCallActions({ state });
  const chatActions = createMobileChatActions({
    state,
    runAction,
    ensureMediaPermission: callActions.ensureMediaPermission
  });
  const accountActions = createMobileAccountActions({
    state,
    runAction,
    closeConversationDetail: chatActions.closeConversationDetail
  });

  useMobileAppEffects({
    state,
    refreshMeData: accountActions.refreshMeData,
    handleRealtimeSocketMessage: callActions.handleRealtimeSocketMessage,
    acceptCallById: callActions.acceptCallById,
    rejectOrEndCallById: callActions.rejectOrEndCallById,
    rebuildCallSessionFromServer: callActions.rebuildCallSessionFromServer,
    silentRefreshAddressBookMatches: options =>
      accountActions.refreshAddressBookMatches({
        silent: true,
        isCancelled: options?.isCancelled
      })
  });

  const authScreenProps = buildAuthScreenProps({ state, runAction });
  const chatScreenProps = useMemo(
    () =>
      buildChatScreenProps({
        state,
        chatActions,
        callActions
      }),
    [
      state.activeConversation?.client_conversation_id,
      state.activeMessages,
      state.selectedMessageId,
      state.highlightedMessageId,
      state.isSearchVisible,
      state.searchKeyword,
      state.searchResults,
      state.voicePlayingMessageId,
      state.voicePlayingPositionMs,
      state.typingConversationId,
      state.typersByConversationId,
      state.userPresenceByUserId,
      state.snapshot?.data.contacts,
      state.isMultiSelectMode,
      state.multiSelectedIds,
      state.replyTargetId,
      state.forwardingMessageId,
      state.composerText,
      state.composerToolsVisible,
      chatActions,
      callActions
    ]
  );
  const homeScreenProps = buildHomeScreenProps({
    state,
    chatActions,
    accountActions,
    runAction
  });
  const overlayProps = buildOverlayProps({
    state,
    chatActions,
    accountActions,
    callActions
  });
  const accountSecurityProps = buildAccountSecurityProps({
    state,
    accountActions
  });
  const addContactProps = buildAddContactProps({
    state,
    chatActions,
    accountActions
  });
  const groupManageProps = buildGroupManageProps({
    state,
    accountActions,
    chatActions
  });
  const peerProfileProps = buildPeerProfileProps({
    state,
    chatActions,
    accountActions
  });
  const meProps = buildMeProps({
    state,
    accountActions,
    runAction
  });
  const startConversationProps = buildStartConversationProps({
    state,
    chatActions,
    accountActions
  });
  const workspaceSearchProps = buildWorkspaceSearchProps({
    state,
    chatActions
  });

  const mediaPreviewActions = useMemo(
    () => ({
      openImagePreviewList: state.openImagePreviewList,
      setPreviewVideo: state.setPreviewVideo,
      openAttachment: chatActions.openAttachmentInSystem
    }),
    [
      state.openImagePreviewList,
      state.setPreviewVideo,
      chatActions.openAttachmentInSystem
    ]
  );

  const onRetryConnection = useCallback(() => {
    mobileRealtimeClient.connect().catch(() => {
      /* connect() handles errors internally; guard against unhandled rejection */
    });
  }, []);

  const dismissError = useCallback(() => {
    state.setError("");
  }, [state.setError]);

  return {
    snapshot: state.snapshot,
    status: state.status,
    error: state.error,
    pending: state.pending,
    isAuthenticated: state.isAuthenticated,
    isLoggingOut,
    activeConversation: state.activeConversation,
    realtimeStatus: state.realtimeStatus,
    onRetryConnection,
    dismissError,
    authScreenProps,
    chatScreenProps,
    homeScreenProps,
    overlayProps,
    accountSecurityProps,
    addContactProps,
    groupManageProps,
    peerProfileProps,
    meProps,
    startConversationProps,
    workspaceSearchProps,
    mediaPreviewActions
  };
}
