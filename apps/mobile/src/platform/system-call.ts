import { NativeEventEmitter, NativeModules, Platform } from "react-native";
import { deviceStorage } from "../data/storage";
import { clearIncomingCallNotification } from "./notifications/calls";
import type { MobileNotificationPayload } from "./notification-center";
import log from "../utils/log";

const callKeepLog = log.scope("callkeep");

/**
 * Platform strategy:
 *   - iOS: CallKit is driven through CallKeep (`displayIncomingCall` /
 *     `setCurrentCallActive` / `endCall` / answer/end events), so the whole
 *     CallKeep bridge stays active here.
 *   - Android (API 26+): a self-managed telecom ConnectionService is used
 *     (`call/MeshConnectionService`), which needs no
 *     READ_PHONE_NUMBERS/CALL_PHONE permissions and no user-facing account
 *     confirmation. It gives the OS ringing + lock-screen call notification;
 *     the full-screen incoming-call UI stays with our Notifee notification +
 *     CallOverlay. The pending-action persistence below (answer/end) is shared
 *     so a killed/background action can be replayed on cold start.
 *   - Android < API 26: fall back to the Notifee-only pipeline (no
 *     ConnectionService).
 *
 * Persistent flag: once the iOS CallKit setup has run, we never re-trigger
 * `callKeep.setup()` on subsequent cold starts.
 */
const CALLKEEP_SETUP_COMPLETED_KEY = "mushroom.mobile.callkeep-setup-completed";

/** Native events emitted by `MushroomCallConnection` (Android). */
const CALL_EVENT_ANSWER = "MushroomCallAnswer";
const CALL_EVENT_END = "MushroomCallEnd";

function isCallKeepSetupPersisted(): boolean {
  return deviceStorage.getString(CALLKEEP_SETUP_COMPLETED_KEY) === "1";
}

function persistCallKeepSetup(): void {
  deviceStorage.set(CALLKEEP_SETUP_COMPLETED_KEY, "1");
}

const PENDING_SYSTEM_CALL_ACTION_KEY =
  "mushroom.mobile.pending-system-call-action";

type PendingSystemCallAction = {
  type: "answer" | "end";
  callId: string;
  createdAt: string;
};

let setupCompleted = false;
let setupPromise: Promise<void> | null = null;
let listenersBound = false;
const answerListeners = new Set<(action: PendingSystemCallAction) => void>();
const endListeners = new Set<(action: PendingSystemCallAction) => void>();
const callTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
/**
 * Incoming-call ids already reported to the system. The same `call.invite`
 * can arrive via both the WebSocket `call.invited` branch and the push
 * `onForegroundMessage` path; reporting the system call twice would double
 * the OS ringing / re-arm the timeout. Cleared on `endSystemCall`.
 */
const reportedIncomingCallIds = new Set<string>();
let callKeepUnavailableLogged = false;

type CallKeepModule = {
  setup?: (options: Record<string, unknown>) => Promise<void> | void;
  addEventListener?: (
    eventName: string,
    listener: (event: { callUUID?: string; callId?: string }) => void
  ) => void;
  backToForeground?: () => void;
  displayIncomingCall?: (
    uuid: string,
    handle: string,
    localizedCallerName?: string,
    handleType?: string,
    hasVideo?: boolean
  ) => Promise<void> | void;
  setCurrentCallActive?: (uuid: string) => Promise<void> | void;
  endCall?: (uuid: string) => Promise<void> | void;
};

function isJestRuntime() {
  return false;
}

function getCallKeep(): CallKeepModule | null {
  if (isJestRuntime()) {
    return null;
  }

  // Android intentionally does not use CallKeep — incoming calls go through
  // our Notifee full-screen notification + CallOverlay pipeline (see the
  // module doc comment). Short-circuiting here keeps every CallKeep native
  // call a no-op on Android and avoids the READ_PHONE_NUMBERS crash in
  // `VoiceConnectionService`.
  if (Platform.OS === "android") {
    return null;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const moduleValue = require("react-native-callkeep") as
      | CallKeepModule
      | { default?: CallKeepModule }
      | undefined;
    const callKeep =
      moduleValue &&
      typeof moduleValue === "object" &&
      "default" in moduleValue &&
      moduleValue.default
        ? moduleValue.default
        : moduleValue;

    if (!callKeep || typeof callKeep !== "object") {
      return null;
    }

    return callKeep as CallKeepModule;
  } catch {
    if (!callKeepUnavailableLogged) {
      callKeepUnavailableLogged = true;
      callKeepLog.info(
        "Native CallKeep bridge is unavailable; skipping system call integration."
      );
    }
    return null;
  }
}

function persistPendingSystemCallAction(action: PendingSystemCallAction) {
  deviceStorage.set(PENDING_SYSTEM_CALL_ACTION_KEY, JSON.stringify(action));
}

/**
 * The self-managed telecom bridge on Android (`call/MeshConnectionModule`).
 * Only used on Android 8+ (API 26); below that we fall back to the
 * Notifee-only pipeline.
 */
type AndroidCallConnectionModule = {
  reportIncomingCall?: (
    callId: string,
    callerName: string,
    hasVideo: boolean
  ) => void;
  endCall?: (callId: string) => void;
};

function getAndroidCallConnection(): AndroidCallConnectionModule | null {
  if (Platform.OS !== "android" || (Platform.Version as number) < 26) {
    return null;
  }
  const bridge = NativeModules.MushroomCallConnection;
  return bridge ?? null;
}

export function consumePendingSystemCallAction() {
  const raw = deviceStorage.getString(PENDING_SYSTEM_CALL_ACTION_KEY);
  if (!raw) {
    return null;
  }

  deviceStorage.remove(PENDING_SYSTEM_CALL_ACTION_KEY);
  try {
    return JSON.parse(raw) as PendingSystemCallAction;
  } catch {
    return null;
  }
}

/**
 * Handle an incoming-call action tapped on the full-screen call notification
 * (Notifee `answer`/`decline` action buttons). Android renders no native
 * caller UI (CallKeep is not used), so the call buttons live on the
 * notification. This persists the action (so a killed/background cold start
 * can replay it via the auth-gated effect) and notifies registered listeners
 * for the live-foreground case. The app itself is brought back by the
 * notification action's `launchActivity`.
 */
export function handleNotificationCallAction(
  type: "answer" | "decline",
  callId: string
) {
  if (!callId) {
    return;
  }

  const action: PendingSystemCallAction = {
    type: type === "answer" ? "answer" : "end",
    callId,
    createdAt: new Date().toISOString()
  };
  persistPendingSystemCallAction(action);

  if (action.type === "answer") {
    for (const listener of answerListeners) {
      listener(action);
    }
    return;
  }

  clearSystemCallTimeout(callId);
  for (const listener of endListeners) {
    listener(action);
  }
}

async function ensureCallKeepSetup() {
  const callKeep = getCallKeep();
  if (!callKeep) {
    return;
  }

  // iOS-only setup; the persisted flag keeps the CallKit setup idempotent
  // across cold starts.
  if (isCallKeepSetupPersisted()) {
    setupCompleted = true;
    return;
  }

  if (setupCompleted) {
    return;
  }

  if (!setupPromise) {
    persistCallKeepSetup();
    setupPromise = Promise.resolve(
      callKeep.setup?.({
        ios: {
          appName: "Mesh",
          supportsVideo: true,
          maximumCallGroups: "1",
          maximumCallsPerCallGroup: "1",
          ringtoneSound: "incoming_ring.wav",
          includesCallsInRecents: false
        }
      })
    )
      .then(() => {
        setupCompleted = true;
      })
      .finally(() => {
        if (!setupCompleted) {
          setupPromise = null;
        }
      });
  }

  await setupPromise;
}

function bindCallKeepListeners() {
  const callKeep = getCallKeep();
  if (!callKeep || listenersBound) {
    return;
  }

  listenersBound = true;
  callKeep.addEventListener?.(
    "answerCall",
    (event: { callUUID?: string; callId?: string }) => {
      const callId = String(event.callUUID ?? event.callId ?? "");
      if (!callId) {
        return;
      }

      const action: PendingSystemCallAction = {
        type: "answer",
        callId,
        createdAt: new Date().toISOString()
      };
      persistPendingSystemCallAction(action);
      callKeep.backToForeground?.();
      for (const listener of answerListeners) {
        listener(action);
      }
    }
  );

  callKeep.addEventListener?.(
    "endCall",
    (event: { callUUID?: string; callId?: string }) => {
      const callId = String(event.callUUID ?? event.callId ?? "");
      if (!callId) {
        return;
      }

      const action: PendingSystemCallAction = {
        type: "end",
        callId,
        createdAt: new Date().toISOString()
      };
      persistPendingSystemCallAction(action);
      clearSystemCallTimeout(callId);
      for (const listener of endListeners) {
        listener(action);
      }
    }
  );
}

function clearSystemCallTimeout(callId: string) {
  const current = callTimeouts.get(callId);
  if (current) {
    clearTimeout(current);
    callTimeouts.delete(callId);
  }
}

export function initializeSystemCallManager(options: {
  onAnswerCall?: (action: PendingSystemCallAction) => Promise<void> | void;
  onEndCall?: (action: PendingSystemCallAction) => Promise<void> | void;
}) {
  const cleanups: Array<() => void> = [];

  if (Platform.OS === "android") {
    const bridge = getAndroidCallConnection();
    if (bridge) {
      const emitter = new NativeEventEmitter(
        NativeModules.MushroomCallConnection
      );
      const answerSub = emitter.addListener(
        CALL_EVENT_ANSWER,
        (event: { callId?: string }) => {
          const callId = String(event?.callId ?? "");
          if (!callId) {
            return;
          }
          const action: PendingSystemCallAction = {
            type: "answer",
            callId,
            createdAt: new Date().toISOString()
          };
          persistPendingSystemCallAction(action);
          for (const listener of answerListeners) {
            listener(action);
          }
        }
      );
      const endSub = emitter.addListener(
        CALL_EVENT_END,
        (event: { callId?: string }) => {
          const callId = String(event?.callId ?? "");
          if (!callId) {
            return;
          }
          const action: PendingSystemCallAction = {
            type: "end",
            callId,
            createdAt: new Date().toISOString()
          };
          persistPendingSystemCallAction(action);
          clearSystemCallTimeout(callId);
          for (const listener of endListeners) {
            listener(action);
          }
        }
      );
      cleanups.push(() => {
        answerSub.remove();
        endSub.remove();
      });
    }
  } else {
    bindCallKeepListeners();
  }

  const answerListener = options.onAnswerCall
    ? (action: PendingSystemCallAction) => {
        void options.onAnswerCall?.(action);
      }
    : null;
  const endListener = options.onEndCall
    ? (action: PendingSystemCallAction) => {
        void options.onEndCall?.(action);
      }
    : null;

  if (options.onAnswerCall) {
    answerListeners.add(
      answerListener as (action: PendingSystemCallAction) => void
    );
  }
  if (options.onEndCall) {
    endListeners.add(endListener as (action: PendingSystemCallAction) => void);
  }

  return () => {
    for (const cleanup of cleanups) {
      cleanup();
    }
    if (answerListener) {
      answerListeners.delete(answerListener);
    }
    if (endListener) {
      endListeners.delete(endListener);
    }
  };
}

export async function reportIncomingSystemCall(
  payload: MobileNotificationPayload
) {
  if (!payload.callId) {
    return;
  }

  // 同一条来电可能经 WS `call.invited` 与推送 `onForegroundMessage` 双路径
  // 到达，重复上报系统来电会造成双响铃 / 重复设置超时。只处理第一次。
  if (reportedIncomingCallIds.has(payload.callId)) {
    return;
  }
  reportedIncomingCallIds.add(payload.callId);

  // Android (API 26+): report the call to the self-managed telecom
  // ConnectionService so the OS rings and shows a lock-screen call
  // notification; the full-screen UI is the Notifee notification + CallOverlay
  // (surfaced by the callers themselves). Below API 26 the notification-only
  // pipeline applies. Either way, the ringing timeout below still cleans up an
  // unanswered call.
  if (Platform.OS === "ios") {
    const callKeep = getCallKeep();
    if (callKeep) {
      await ensureCallKeepSetup();
      const callerName =
        payload.conversationName || payload.title || payload.body || "Mushroom";
      await callKeep.displayIncomingCall?.(
        payload.callId,
        payload.conversationId || "mushroom",
        callerName,
        "generic",
        payload.mediaType === 2
      );
    }
  } else if (Platform.OS === "android") {
    const bridge = getAndroidCallConnection();
    if (bridge?.reportIncomingCall) {
      bridge.reportIncomingCall(
        payload.callId,
        payload.conversationName || payload.title || payload.body || "Mushroom",
        payload.mediaType === 2
      );
    }
  }

  clearSystemCallTimeout(payload.callId);
  if (payload.timeoutSeconds && payload.timeoutSeconds > 0) {
    callTimeouts.set(
      payload.callId,
      setTimeout(() => {
        void endSystemCall(payload.callId || "");
      }, payload.timeoutSeconds * 1000)
    );
  }
}

/**
 * Mark the system call as active. iOS: activates the CallKit audio session so
 * the call leaves the "connecting" state. Android: no-op — the self-managed
 * ConnectionService connection was already set active by the native layer on
 * answer.
 */
export async function markSystemCallActive(callId: string) {
  const callKeep = getCallKeep();
  if (!callKeep || !callId) {
    return;
  }

  await ensureCallKeepSetup();
  await callKeep.setCurrentCallActive?.(callId);
}

export async function endSystemCall(callId: string) {
  if (!callId) {
    return;
  }

  reportedIncomingCallIds.delete(callId);
  clearSystemCallTimeout(callId);
  if (Platform.OS === "ios") {
    await getCallKeep()?.endCall?.(callId);
  } else {
    // Android: tear down the self-managed ConnectionService call (if any) and
    // clear the full-screen incoming-call notification.
    const bridge = getAndroidCallConnection();
    if (bridge?.endCall) {
      bridge.endCall(callId);
    }
    await clearIncomingCallNotification(callId);
  }
}

/**
 * Reset the persisted "setup completed" flag so the native phone-account dialog
 * re-appears on next cold start. Exposed for a future in-app "通话权限检测"
 * settings entry (parity with WhatsApp's troubleshooting screen).
 */
export function resetCallKeepSetupCompleted(): void {
  deviceStorage.remove(CALLKEEP_SETUP_COMPLETED_KEY);
  setupCompleted = false;
}
