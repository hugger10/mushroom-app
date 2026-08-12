/**
 * Ongoing-call foreground service (Android) + connection keep-alive.
 *
 * When a call is connected (`ongoing`) and the user backgrounds the app
 * (Home key), the OS may suspend / reclaim the process and tear down both
 * the WebRTC media and the signalling WebSocket. To match
 * WhatsApp/Telegram/WeChat behaviour we pin a foreground service for the
 * duration of the call so the process stays alive in the background.
 *
 * iOS does not use a foreground service — the existing `Info.plist`
 * `voip`/`audio` background modes + CallKit keep the audio session (and
 * thus the process) alive, while the JS layer keeps the signalling socket
 * connected (see `useMobileConnectivityEffects`). So everything here is a
 * no-op on iOS.
 */

import { Platform } from "react-native";
import { check, PERMISSIONS, RESULTS } from "react-native-permissions";
import { AndroidForegroundServiceType } from "@notifee/react-native";
import { getNotifeeRuntime, notifyLog } from "./runtime";
import { ONGOING_CALL_CHANNEL_ID, ONGOING_CALL_NOTIFICATION_ID } from "./types";
import { i18n } from "../../i18n";

let foregroundServiceRegistered = false;
let serviceActive = false;

async function isMediaPermissionGranted(permission: string): Promise<boolean> {
  try {
    const status = await check(permission as Parameters<typeof check>[0]);
    return status === RESULTS.GRANTED || status === RESULTS.LIMITED;
  } catch {
    return false;
  }
}

/**
 * Register the long-running foreground-service task exactly once. Notifee
 * requires a task that resolves only when the service should stop; we return
 * a promise that resolves when {@link stopOngoingCallService} is called.
 */
let resolveServiceTask: (() => void) | null = null;

function ensureForegroundServiceRegistered() {
  if (foregroundServiceRegistered || Platform.OS !== "android") {
    return;
  }
  const { client } = getNotifeeRuntime();
  if (!client?.registerForegroundService) {
    return;
  }
  foregroundServiceRegistered = true;
  client.registerForegroundService(
    () =>
      new Promise<void>(resolve => {
        resolveServiceTask = resolve;
      })
  );
}

async function ensureOngoingCallChannel() {
  const { client, AndroidImportance } = getNotifeeRuntime();
  if (!client?.createChannel || Platform.OS !== "android") {
    return;
  }
  await client.createChannel({
    id: ONGOING_CALL_CHANNEL_ID,
    name: i18n.t("notifications.ongoingCall"),
    // LOW importance: the ongoing-call notification must not buzz/peek; it is
    // purely a persistent status entry that keeps the process alive.
    importance: AndroidImportance?.LOW ?? 2
  });
}

/**
 * Start (or update) the ongoing-call foreground service. Idempotent: calling
 * it again while active simply refreshes the notification (e.g. audio → video
 * upgrade changes the declared service type).
 *
 * The declared FGS type must match runtime-granted permissions, otherwise
 * Android 14+ throws `SecurityException` and the app crashes:
 *   - `ringing` phase: the mic/camera are NOT being captured yet, so we must
 *     not declare `microphone`/`camera` (RECORD_AUDIO may not be granted on a
 *     first cold start with a self-managed phone account). Use the
 *     permission-free `shortService` type (declared in the manifest) instead.
 *   - `ongoing` phase: declare `microphone`/`camera` only for permissions the
 *     user actually granted; fall back to `shortService` when none are granted
 *     so the keep-alive still works without crashing.
 *   - Android < 14 has no runtime-permission requirement for FGS types, so the
 *     original `microphone` (+`camera`) types are kept there.
 */
export async function startOngoingCallService(options: {
  title: string;
  hasVideo: boolean;
  phase: "ringing" | "ongoing";
}): Promise<void> {
  if (Platform.OS !== "android") {
    return;
  }
  const { client } = getNotifeeRuntime();
  if (!client?.displayNotification) {
    return;
  }

  ensureForegroundServiceRegistered();
  await ensureOngoingCallChannel();

  const isAndroid14Plus = (Platform.Version as number) >= 34;
  const foregroundServiceTypes: number[] = [];

  if (options.phase === "ongoing") {
    if (await isMediaPermissionGranted(PERMISSIONS.ANDROID.RECORD_AUDIO)) {
      foregroundServiceTypes.push(
        AndroidForegroundServiceType.FOREGROUND_SERVICE_TYPE_MICROPHONE
      );
    }
    if (
      options.hasVideo &&
      (await isMediaPermissionGranted(PERMISSIONS.ANDROID.CAMERA))
    ) {
      foregroundServiceTypes.push(
        AndroidForegroundServiceType.FOREGROUND_SERVICE_TYPE_CAMERA
      );
    }
  }

  if (foregroundServiceTypes.length === 0) {
    // ringing phase (no capture yet) or ongoing with all permissions denied:
    // keep the process alive with a permission-free FGS type on Android 14+;
    // pre-14 FGS types have no permission requirement so the mic/camera types
    // are safe as a keep-alive.
    foregroundServiceTypes.push(
      isAndroid14Plus
        ? AndroidForegroundServiceType.FOREGROUND_SERVICE_TYPE_SHORT_SERVICE
        : AndroidForegroundServiceType.FOREGROUND_SERVICE_TYPE_MICROPHONE
    );
  }

  notifyLog.info("startOngoingCallService", {
    hasVideo: options.hasVideo,
    phase: options.phase,
    wasActive: serviceActive
  });
  serviceActive = true;

  await client.displayNotification({
    id: ONGOING_CALL_NOTIFICATION_ID,
    title: options.title,
    body: options.hasVideo
      ? i18n.t("notifications.ongoingVideoCall")
      : i18n.t("notifications.ongoingVoiceCall"),
    android: {
      channelId: ONGOING_CALL_CHANNEL_ID,
      asForegroundService: true,
      foregroundServiceTypes,
      ongoing: true,
      onlyAlertOnce: true,
      smallIcon: "ic_launcher",
      pressAction: {
        id: "default"
      }
    }
  });

  // Guard: stopOngoingCallService may have been called while displayNotification
  // was in flight (e.g. ringing → rejected in quick succession). In that case
  // serviceActive has already been cleared but the foreground service is now
  // running with no way to stop it. Detect this and stop immediately.
  if (!serviceActive) {
    notifyLog.info(
      "startOngoingCallService: stopped during display, cleaning up"
    );
    resolveServiceTask?.();
    resolveServiceTask = null;
    await Promise.allSettled([
      client?.stopForegroundService?.(),
      client?.cancelNotification?.(ONGOING_CALL_NOTIFICATION_ID)
    ]);
  }
}

/**
 * Stop the ongoing-call foreground service and remove its notification.
 * Safe to call when no service is active.
 */
export async function stopOngoingCallService(): Promise<void> {
  if (Platform.OS !== "android" || !serviceActive) {
    return;
  }
  serviceActive = false;
  notifyLog.info("stopOngoingCallService");

  // Resolve the registered task promise so notifee can detach the foreground
  // service, then explicitly stop + cancel for good measure.
  resolveServiceTask?.();
  resolveServiceTask = null;

  const { client } = getNotifeeRuntime();
  await Promise.allSettled([
    client?.stopForegroundService?.(),
    client?.cancelNotification?.(ONGOING_CALL_NOTIFICATION_ID)
  ]);
}
