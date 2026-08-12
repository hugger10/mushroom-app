/**
 * @format
 */

import "react-native-gesture-handler";
import { registerGlobals } from "@livekit/react-native";
import { AppRegistry } from "react-native";
import { Platform } from "react-native";
import App from "./main";
import { name as appName } from "./app.json";
import { initLogger } from "./src/utils/log";
import {
  clearIncomingCallNotification,
  displayIncomingCallNotification,
  parseNotificationPayload,
  registerNotificationBackgroundHandlers
} from "./src/platform/notification-center";
import {
  endSystemCall,
  reportIncomingSystemCall
} from "./src/platform/system-call";

// Wire LiveKit's WebRTC globals (RTCPeerConnection, mediaDevices, MediaStream,
// ...) into the JS runtime. Required before any WebRTC usage — both the 1:1
// direct calls and the LiveKit group-call SFU path rely on these globals.
registerGlobals();

initLogger();

/**
 * Shared handler for a background/killed-state call payload. Drives the system
 * call UI (CallKeep) plus, on Android, a full-screen incoming-call
 * notification. Used by both the FCM/HMS background message handler and the
 * Xiaomi HeadlessJS task.
 */
async function handleBackgroundCallPayload(payload) {
  if (!payload) {
    return;
  }

  if (payload.type === "call.invite") {
    if (Platform.OS === "android") {
      await displayIncomingCallNotification(payload);
    }
    await reportIncomingSystemCall(payload);
    return;
  }

  if (payload.type === "call.missed" && payload.callId) {
    await clearIncomingCallNotification(payload.callId);
    await endSystemCall(payload.callId);
  }
}

registerNotificationBackgroundHandlers({
  onBackgroundPayload: async payload => {
    await handleBackgroundCallPayload(payload);
  }
});

/**
 * HeadlessJS task invoked by the native Xiaomi Mi-Push receiver
 * (`XiaomiHeadlessService`) when a call payload arrives while the app is
 * backgrounded/killed. The native side passes the raw JSON payload string.
 */
AppRegistry.registerHeadlessTask("XiaomiCallPush", () => async taskData => {
  try {
    const raw = taskData?.payload;
    if (!raw) {
      return;
    }
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    const payload = parseNotificationPayload(data);
    await handleBackgroundCallPayload(payload);
  } catch {
    // Never throw from a headless task — a crash here can be reported as an
    // ANR by the OS. Failures simply mean no incoming-call UI this time.
  }
});

AppRegistry.registerComponent(appName, () => App);
