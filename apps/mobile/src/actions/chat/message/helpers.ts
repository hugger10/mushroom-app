import type { MobileAppState } from "../../../app/controller/useMobileAppState";
import { applyConversationDisplayFallbacks } from "../../../utils/display";
import type { NormalizedConversation } from "./types";

export function createMessageHelpers(state: MobileAppState) {
  function getNormalizedActiveConversation(): NormalizedConversation | null {
    if (!state.activeConversation || !state.snapshot?.auth.user) {
      return null;
    }

    const [conversation] = applyConversationDisplayFallbacks({
      conversations: [state.activeConversation],
      contacts: state.friends,
      loginUser: state.snapshot.auth.user
    });
    return conversation ?? null;
  }

  return { getNormalizedActiveConversation };
}
