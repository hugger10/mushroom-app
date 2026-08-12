import { createAccountSessionActions } from "./account/account-session-actions";
import { createContactActions } from "./account/contact-actions";
import { createGroupActions } from "./account/group-actions";
import type { RunAction } from "./action-types";
import type { MobileAppState } from "../app/controller/useMobileAppState";

export function createMobileAccountActions(params: {
  state: MobileAppState;
  runAction: RunAction;
  closeConversationDetail: () => void;
}) {
  const { state, runAction, closeConversationDetail } = params;
  const sessionActions = createAccountSessionActions({ state, runAction });
  const contactActions = createContactActions({ state, runAction });
  const groupActions = createGroupActions({
    state,
    runAction,
    closeConversationDetail
  });

  return {
    ...sessionActions,
    ...contactActions,
    ...groupActions
  };
}
