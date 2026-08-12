/**
 * Drives the platform-level keep-alive that lets an ongoing call survive the
 * app being backgrounded (Home key), mirroring WhatsApp/Telegram/WeChat:
 *
 *   - Android: pin a foreground service for the call's lifetime so the OS
 *     does not suspend/reclaim the process (which would tear down WebRTC media
 *     and the signalling WebSocket). Started when the call reaches `ringing`/
 *     `ongoing`, stopped when it ends.
 *   - All platforms: once the call ends while the app is already in the
 *     background, disconnect the signalling WebSocket that the connectivity
 *     effect deliberately kept alive during the call (see
 *     `useMobileConnectivityEffects`), so we don't keep a socket open in the
 *     background after the call is over.
 *
 * iOS keep-alive relies on the existing `voip`/`audio` background modes +
 * CallKit; the foreground-service calls below are no-ops on iOS.
 */

import { useEffect } from "react";
import { AppState } from "react-native";
import { CALL_MEDIA_TYPE_VIDEO } from "@mushroom/shared";
import {
  startOngoingCallService,
  stopOngoingCallService
} from "../../../platform/notification-center";
import { setPipAutoEnter } from "../../../platform/pip";
import { mobileRealtimeClient } from "../../../services/app-runtime";
import log from "../../../utils/log";
import type { MobileAppState } from "../useMobileAppState";
import { i18n } from "../../../i18n";

const callLog = log.scope("call-keepalive");

export function useMobileCallLifecycleEffects(params: {
  state: MobileAppState;
}) {
  const { state } = params;
  const phase = state.callSession?.phase ?? null;
  const mediaType = state.callSession?.media_type ?? null;
  const label =
    state.callSession?.conversation_label ?? i18n.t("ui.callOverlay.call");
  // A call is "live" (needs keep-alive) while ringing or ongoing; busy /
  // rejected / timeout / ended are terminal.
  // The foreground service keeps the signalling WebSocket (and WebRTC media on
  // `ongoing`) alive across backgrounding. NOTE: on Android 14+ a
  // `FOREGROUND_SERVICE_TYPE_MICROPHONE/CAMERA` service requires the matching
  // runtime permission or the OS throws `SecurityException`; during `ringing`
  // the mic/camera are not captured yet and RECORD_AUDIO may be ungranted on a
  // first cold start (self-managed phone account), so `startOngoingCallService`
  // declares a permission-free `shortService` type for ringing and only uses
  // microphone/camera once the call is ongoing and permissions are granted.
  const isLive = phase === "ringing" || phase === "ongoing";
  const hasVideo = mediaType === CALL_MEDIA_TYPE_VIDEO;

  useEffect(() => {
    if (isLive) {
      void startOngoingCallService({
        title: label,
        hasVideo,
        phase: phase === "ongoing" ? "ongoing" : "ringing"
      }).catch(error => {
        callLog.warn("startOngoingCallService failed", {
          message: error instanceof Error ? error.message : String(error)
        });
      });
      return;
    }

    // Call is no longer live: tear down the foreground service.
    void stopOngoingCallService().catch(() => undefined);

    // If the call ended while we are backgrounded, the connectivity effect
    // kept the WS alive for the call; now that the call is over there is no
    // reason to hold a socket open in the background — disconnect to match the
    // normal backgrounded-idle behaviour. When foregrounded the WS stays as-is.
    if (AppState.currentState === "background") {
      callLog.info("call ended in background: disconnecting signalling WS");
      mobileRealtimeClient.disconnect();
    }
  }, [isLive, hasVideo, label, phase]);

  // Final safety net: ensure the foreground service is stopped if this
  // controller unmounts (logout / app teardown) mid-call.
  useEffect(() => {
    return () => {
      void stopOngoingCallService().catch(() => undefined);
    };
  }, []);

  // Android PiP auto-enter: while a video call is ongoing, pressing Home should
  // shrink the call into a floating PiP window instead of tearing it down.
  // Enabled only for ongoing video (not audio, not while merely ringing). iOS
  // uses livekit's RTCPIPView instead, so this is a no-op there.
  const wantsPipAutoEnter = phase === "ongoing" && hasVideo;
  useEffect(() => {
    void setPipAutoEnter(wantsPipAutoEnter);
    return () => {
      if (wantsPipAutoEnter) {
        void setPipAutoEnter(false);
      }
    };
  }, [wantsPipAutoEnter]);
}
