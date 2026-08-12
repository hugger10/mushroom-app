/**
 * Picture-in-Picture (PiP) for the in-call video overlay.
 *
 *   - Android: backed by the first-party `MushroomPip` native module
 *     (`android/.../pip/*`). Supports auto-enter on Home (system shrinks the
 *     video call into a floating window) and reports PiP mode changes so the
 *     UI can switch to a compact, video-only layout — matching WhatsApp/
 *     Telegram/WeChat.
 *   - iOS: PiP is handled natively by livekit's `RTCPIPView` (the remote
 *     video track renders into an `AVSampleBufferDisplayLayer`-backed PiP
 *     window). This module is therefore a no-op on iOS; the only integration
 *     point is swapping `RTCView` → `RTCPIPView` in the call overlay.
 */

import { NativeEventEmitter, NativeModules, Platform } from "react-native";
import log from "../utils/log";

const pipLog = log.scope("pip");

type MushroomPipNativeModule = {
  isPipSupported(): Promise<boolean>;
  setAutoEnterEnabled(
    enabled: boolean,
    width: number,
    height: number
  ): Promise<boolean>;
  enterPipMode(width: number, height: number): Promise<boolean>;
  isInPipMode(): Promise<boolean>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
};

const PIP_MODE_CHANGED_EVENT = "MushroomPipModeChanged";

// Default 16:9 aspect ratio for the PiP window (landscape video tile).
const DEFAULT_PIP_WIDTH = 16;
const DEFAULT_PIP_HEIGHT = 9;

function getNativeModule(): MushroomPipNativeModule | null {
  if (Platform.OS !== "android") {
    return null;
  }
  const native = NativeModules.MushroomPip as
    | MushroomPipNativeModule
    | undefined;
  return native ?? null;
}

// Module-level singleton emitter. NativeEventEmitter must be constructed once
// per native module — creating a new instance per call increments the native
// addListener refcount on each call, leading to spurious "addListener" calls
// sent to the native side.
let _emitter: NativeEventEmitter | null = null;
function getPipEmitter(): NativeEventEmitter | null {
  if (!getNativeModule()) return null;
  if (!_emitter) {
    _emitter = new NativeEventEmitter(
      NativeModules.MushroomPip as ConstructorParameters<
        typeof NativeEventEmitter
      >[0]
    );
  }
  return _emitter;
}

let cachedSupported: boolean | null = null;

export async function isPipSupported(): Promise<boolean> {
  const native = getNativeModule();
  if (!native) {
    return false;
  }
  if (cachedSupported !== null) {
    return cachedSupported;
  }
  try {
    cachedSupported = await native.isPipSupported();
  } catch {
    cachedSupported = false;
  }
  return cachedSupported;
}

/**
 * Enable/disable auto-entering PiP when the user backgrounds the app (Home key)
 * during a video call. Call with `true` when a video call becomes ongoing and
 * `false` when it ends or downgrades to audio.
 */
export async function setPipAutoEnter(
  enabled: boolean,
  aspect: { width: number; height: number } = {
    width: DEFAULT_PIP_WIDTH,
    height: DEFAULT_PIP_HEIGHT
  }
): Promise<void> {
  const native = getNativeModule();
  if (!native) {
    return;
  }
  try {
    await native.setAutoEnterEnabled(enabled, aspect.width, aspect.height);
  } catch (error) {
    pipLog.warn("setAutoEnterEnabled failed", {
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

/** Subscribe to PiP mode changes. Returns an unsubscribe function. */
export function addPipModeChangeListener(
  listener: (isInPipMode: boolean) => void
): () => void {
  const emitter = getPipEmitter();
  if (!emitter) {
    return () => undefined;
  }
  const subscription = emitter.addListener(
    PIP_MODE_CHANGED_EVENT,
    (payload: { isInPipMode?: boolean }) => {
      listener(Boolean(payload?.isInPipMode));
    }
  );
  return () => subscription.remove();
}
