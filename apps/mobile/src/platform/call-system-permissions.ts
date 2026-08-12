/**
 * First-launch system-call permission guide.
 *
 * Why this exists:
 *   Reliable background/killed incoming-call wake-up depends on a few OS grants
 *   that are NOT covered by the runtime microphone/camera prompts:
 *     - Notifications (Android 13+ POST_NOTIFICATIONS, iOS alerts) — the
 *       full-screen incoming-call notification and the ringtone need them.
 *     - Microphone — pre-requested here so the first long-press on the voice
 *       button starts recording without a mid-gesture permission dialog. The
 *       request is silent (no "open settings" alert) on cold start; the regular
 *       in-flow prompt still guides the user later when actually needed.
 *
 * On Android there is no telecom phone account anymore: incoming calls are
 * rendered by our own Notifee full-screen notification + CallOverlay pipeline
 * (CallKeep is not used), so no phone-account walk-through is needed.
 *
 * This module runs once on cold start (idempotent, gated by a persisted flag),
 * mirroring the onboarding permission walk-through of mainstream IM apps. It is
 * intentionally Alert-driven (no heavyweight screen) to match the existing
 * `media-permissions.ts` style and keep the module decoupled from the UI tree.
 */

import { deviceStorage } from "../data/storage";
import {
  getNotificationPermissionStatus,
  requestNotificationPermission
} from "./notifications/permissions";
import { ensureMicrophonePermissionSilently } from "./media-permissions";
import log from "../utils/log";

const guideLog = log.scope("call-perms");

const CALL_PERMISSION_PROMPTED_KEY =
  "mushroom.mobile.call-permissions-prompted";

function hasPromptedCallPermissions() {
  return deviceStorage.getString(CALL_PERMISSION_PROMPTED_KEY) === "1";
}

function markCallPermissionsPrompted() {
  deviceStorage.set(CALL_PERMISSION_PROMPTED_KEY, "1");
}

/**
 * Reset the "already prompted" flag so the guide runs again. Exposed for a
 * future in-app "通话权限检测" settings entry (parity with WhatsApp's
 * troubleshooting screen) and for tests.
 */
export function resetCallPermissionGuide() {
  deviceStorage.remove(CALL_PERMISSION_PROMPTED_KEY);
}

async function ensureNotificationStep() {
  const status = await getNotificationPermissionStatus();
  if (status === "authorized") {
    return;
  }
  await requestNotificationPermission();
}

/**
 * Pre-request the microphone right after the notification step so the first
 * long-press on the voice button never triggers a permission dialog mid-gesture.
 * Uses the silent resolver: a BLOCKED result must not pop an "open settings"
 * alert during cold start — the in-flow prompt still handles that later.
 */
async function ensureMicrophoneStep() {
  const resolution = await ensureMicrophonePermissionSilently();
  if (!resolution.granted && resolution.status !== "unavailable") {
    guideLog.warn("microphone not granted during cold-start guide", {
      status: resolution.status
    });
  }
}

/**
 * Run the full first-launch call-permission walk-through (notifications, then
 * a silent microphone pre-request). Idempotent: returns immediately if it has
 * already run on this device. Never throws — permission UX must never block
 * app start.
 */
export async function runCallPermissionGuide(options?: {
  force?: boolean;
}): Promise<void> {
  if (!options?.force && hasPromptedCallPermissions()) {
    return;
  }
  // Persist up-front so a mid-flow crash or the user backgrounding the app does
  // not re-trigger the whole walk-through on every launch.
  markCallPermissionsPrompted();

  try {
    await ensureNotificationStep();
    await ensureMicrophoneStep();
  } catch (error) {
    guideLog.warn("call permission guide failed", {
      err: error instanceof Error ? error.message : String(error)
    });
  }
}
