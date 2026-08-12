/**
 * Notification permission entry points and the system-settings deep-link
 * helper. Wraps Notifee + RN Linking, with permissive defaults when the
 * native client is unavailable (e.g. tests).
 */

import { Linking, Platform } from "react-native";
import { ensureNotificationChannels } from "./channels";
import { getNotifeeRuntime, normalizePermissionStatus } from "./runtime";
import type { MobileNotificationPermissionStatus } from "./types";

let permissionPromise: Promise<boolean> | null = null;

export async function ensurePushPermissions() {
  const { client } = getNotifeeRuntime();

  await ensureNotificationChannels();
  if (!client?.requestPermission) {
    return true;
  }

  if (permissionPromise) {
    return permissionPromise;
  }

  try {
    permissionPromise = client.requestPermission().then(result => {
      const status =
        typeof result === "object" && result && "authorizationStatus" in result
          ? Number(result.authorizationStatus)
          : 1;
      return status !== 0;
    });
    return await permissionPromise;
  } catch {
    return Platform.OS !== "ios";
  } finally {
    permissionPromise = null;
  }
}

export async function getNotificationPermissionStatus() {
  const { client } = getNotifeeRuntime();
  if (!client?.getNotificationSettings) {
    return "unknown" as MobileNotificationPermissionStatus;
  }

  try {
    const settings = await client.getNotificationSettings();
    return normalizePermissionStatus(
      (settings as { authorizationStatus?: unknown } | undefined)
        ?.authorizationStatus
    );
  } catch {
    return "unknown" as MobileNotificationPermissionStatus;
  }
}

export async function requestNotificationPermission() {
  const granted = await ensurePushPermissions();
  return granted ? getNotificationPermissionStatus() : "denied";
}

export async function openSystemNotificationSettings() {
  const { client } = getNotifeeRuntime();
  if (client?.openNotificationSettings) {
    await client.openNotificationSettings();
    return;
  }

  await Linking.openSettings();
}
