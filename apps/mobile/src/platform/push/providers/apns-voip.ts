import { NativeEventEmitter, NativeModules, Platform } from "react-native";
import log from "../../../utils/log";

const voipLog = log.scope("voip-push");

type VoipPushManagerModule = {
  getToken?: () => Promise<string | null>;
};

type VoipPushReceivedPayload = Record<string, unknown>;

function getNativeModule(): VoipPushManagerModule | null {
  if (Platform.OS !== "ios") {
    return null;
  }

  const moduleValue = NativeModules.VoipPushManager as
    | VoipPushManagerModule
    | undefined;
  return moduleValue ?? null;
}

/**
 * iOS PushKit (VoIP) bridge.
 *
 * The native `VoipPushManager` (Swift) owns the `PKPushRegistry` and reports
 * CallKit incoming calls synchronously on push receipt. This JS side only:
 *   1. observes the VoIP token so it can be registered with the server as
 *      `voip_token`;
 *   2. observes the decoded push payload so, once the user answers via CallKit,
 *      the app can connect the WebRTC session.
 *
 * No-op on Android (which uses FCM/HMS/Mi-Push background handlers instead).
 */
export function initializeVoipPush(options: {
  onToken: (token: string | null) => void;
  onPush?: (payload: VoipPushReceivedPayload) => void;
}): () => void {
  const nativeModule = getNativeModule();
  if (!nativeModule) {
    return () => {};
  }

  const emitter = new NativeEventEmitter(
    NativeModules.VoipPushManager as never
  );

  const tokenSubscription = emitter.addListener(
    "voipTokenReceived",
    (event: { token?: string | null }) => {
      const token = typeof event?.token === "string" ? event.token : null;
      voipLog.info("token event", { hasToken: Boolean(token) });
      options.onToken(token && token.length > 0 ? token : null);
    }
  );

  const pushSubscription = emitter.addListener(
    "voipPushReceived",
    (event: VoipPushReceivedPayload) => {
      voipLog.info("push event", {
        callId: typeof event?.call_id === "string" ? event.call_id : undefined
      });
      options.onPush?.(event ?? {});
    }
  );

  // Pull any token that was delivered before JS subscribed (cold start).
  void nativeModule.getToken?.().then(token => {
    if (token && token.length > 0) {
      options.onToken(token);
    }
  });

  return () => {
    tokenSubscription.remove();
    pushSubscription.remove();
  };
}

export async function getVoipPushToken(): Promise<string | null> {
  const nativeModule = getNativeModule();
  if (!nativeModule?.getToken) {
    return null;
  }
  try {
    return await nativeModule.getToken();
  } catch {
    return null;
  }
}
