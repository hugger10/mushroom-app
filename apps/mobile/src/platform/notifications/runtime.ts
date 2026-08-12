/**
 * Internal helpers shared across the notifications/* modules. Not
 * exported through the `notification-center` barrel; consumers outside
 * this folder must use the higher-level entry points.
 */

import notifee, {
  AndroidImportance,
  AndroidVisibility,
  EventType
} from "@notifee/react-native";
import { deviceStorage } from "../../data/storage";
import log from "../../utils/log";
import {
  PENDING_NOTIFICATION_OPEN_KEY,
  type MobileNotificationPayload,
  type MobileNotificationPermissionStatus
} from "./types";

export const notifyLog = log.scope("notify");

export function isJestRuntime() {
  return false;
}

export function getNotifeeRuntime() {
  if (isJestRuntime()) {
    return {
      client: null,
      EventType: null as { PRESS?: number } | null,
      AndroidImportance: null as { HIGH?: number; DEFAULT?: number } | null,
      AndroidVisibility: null as { PUBLIC?: number } | null
    };
  }

  return {
    client: notifee,
    EventType: EventType ?? null,
    AndroidImportance: AndroidImportance ?? null,
    AndroidVisibility: AndroidVisibility ?? null
  };
}

export function parseNumberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function normalizePermissionStatus(
  authorizationStatus: unknown
): MobileNotificationPermissionStatus {
  if (authorizationStatus === 0) {
    return "denied";
  }

  if (
    authorizationStatus === 1 ||
    authorizationStatus === 2 ||
    authorizationStatus === 3 ||
    authorizationStatus === 4
  ) {
    return "authorized";
  }

  return "unknown";
}

export function persistPendingNotificationOpen(
  payload: MobileNotificationPayload
) {
  deviceStorage.set(PENDING_NOTIFICATION_OPEN_KEY, JSON.stringify(payload));
}
