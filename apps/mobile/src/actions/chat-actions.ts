import { createConversationActions } from "./chat/conversation-actions";
import { createMessageActions } from "./chat/message-actions";
import { createVoiceActions } from "./chat/voice-actions";
import type { RunAction } from "./action-types";
import type { MobileAppState } from "../app/controller/useMobileAppState";

export function createMobileChatActions(params: {
  state: MobileAppState;
  runAction: RunAction;
  ensureMediaPermission: (kind: "microphone" | "camera") => Promise<boolean>;
}) {
  const { state, runAction, ensureMediaPermission } = params;
  const conversationActions = createConversationActions({ state, runAction });
  const messageActions = createMessageActions({ state });
  const voiceActions = createVoiceActions({
    state,
    ensureMediaPermission,
    messageActions
  });

  return {
    ...conversationActions,
    ...messageActions,
    ...voiceActions
  };
}
