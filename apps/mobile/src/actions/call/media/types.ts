import type { MediaStream } from "@livekit/react-native-webrtc";
import type { CallMediaType } from "@mushroom/shared";
import type { MobileCallUiSession } from "../../../types/app";
import type { createCallPermissionActions } from "../call-permissions";

export type PermissionActions = ReturnType<typeof createCallPermissionActions>;

export type PreparedLocalCallMedia = {
  effectiveMediaType: CallMediaType;
  localAudioEnabled: boolean;
  localVideoEnabled: boolean;
  localParticipationMode: MobileCallUiSession["local_participation_mode"];
  stream: MediaStream | null;
  notice?: string;
};
