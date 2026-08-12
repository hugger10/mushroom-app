import type { createMobileChatActions } from "../../actions/chat-actions";
import type { WorkspaceSearchProps } from "../../features/workspace-search";
import type { MobileAppState } from "../controller/useMobileAppState";

type ChatActions = ReturnType<typeof createMobileChatActions>;

export function buildWorkspaceSearchProps(params: {
  state: MobileAppState;
  chatActions: ChatActions;
}): WorkspaceSearchProps {
  const { state, chatActions } = params;
  return {
    onOpenResult: result => {
      void chatActions.handleOpenWorkspaceSearchResult(result);
    },
    onError: message => {
      state.setError(message);
    }
  };
}
