import type { MobileCallUiSession } from "../../../types/app";
import type { MobileAppState } from "../../../app/controller/useMobileAppState";
import { sameUserId } from "../../../utils/app-ui";

export function createGetRemoteParticipant(state: MobileAppState) {
  return function getRemoteParticipant(
    session: MobileCallUiSession,
    preferredDeviceId?: string
  ) {
    const currentUserId = state.snapshot?.auth.user?.userId;
    const candidates = session.participants.filter(
      participant => !sameUserId(participant.user_id, currentUserId)
    );

    if (preferredDeviceId) {
      return (
        candidates.find(
          participant => participant.device_id === preferredDeviceId
        ) ??
        candidates[0] ??
        null
      );
    }

    return candidates[0] ?? null;
  };
}
