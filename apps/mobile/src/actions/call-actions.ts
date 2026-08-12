import { createCallMediaActions } from "./call/call-media-actions";
import { createCallPermissionActions } from "./call/call-permissions";
import { createCallRealtimeActions } from "./call/call-realtime-actions";
import { createCallSessionActions } from "./call/call-session-actions";
import type { MobileAppState } from "../app/controller/useMobileAppState";

export function createMobileCallActions(params: { state: MobileAppState }) {
  const { state } = params;
  const permissionActions = createCallPermissionActions();
  const mediaActions = createCallMediaActions({
    state,
    permissionActions
  });
  const sessionActions = createCallSessionActions({
    state,
    permissionActions,
    mediaActions
  });
  const realtimeActions = createCallRealtimeActions({
    state,
    sessionActions,
    mediaActions
  });

  return {
    ...permissionActions,
    ...mediaActions,
    ...sessionActions,
    ...realtimeActions
  };
}
