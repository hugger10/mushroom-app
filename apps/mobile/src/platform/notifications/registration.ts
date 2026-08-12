/**
 * Push-registration sync entry point + the cold-open deep-link consumer.
 * Sits between the unified push provider and the rest of the app.
 */

import { deviceStorage } from "../../data/storage";
import {
  syncUnifiedPushRegistration,
  type MobilePushRegistration
} from "../push-provider";
import {
  PENDING_NOTIFICATION_OPEN_KEY,
  type MobileNotificationPayload
} from "./types";

export function consumePendingNotificationOpen() {
  const raw = deviceStorage.getString(PENDING_NOTIFICATION_OPEN_KEY);
  if (!raw) {
    return null;
  }

  deviceStorage.remove(PENDING_NOTIFICATION_OPEN_KEY);
  try {
    return JSON.parse(raw) as MobileNotificationPayload;
  } catch {
    return null;
  }
}

export async function syncPushRegistration(
  onPushRegistration: (
    registration: MobilePushRegistration
  ) => Promise<void> | void
) {
  return syncUnifiedPushRegistration({
    onRegistration: onPushRegistration
  });
}
