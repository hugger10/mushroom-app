/**
 * OS app-icon badge integration (WeChat-style unread count on the home
 * screen / springboard).
 *
 * Backed by Notifee's `setBadgeCount`. On iOS this maps to
 * `UIApplication.applicationIconBadgeNumber` and is fully reliable. On
 * Android there is no universal numeric-badge standard: AOSP launchers
 * show only a dot, and several OEM ROMs (Xiaomi / Huawei / Samsung) drive
 * the count from their own channels — so `setBadgeCount` is best-effort
 * there and silently degrades on unsupported devices.
 *
 * All calls are wrapped so a missing/native-throwing implementation never
 * crashes the JS runtime (relevant for background headless tasks where the
 * native module may not be fully attached).
 */

import { getNotifeeRuntime, notifyLog } from "./runtime";

/**
 * Set the app-icon badge to an absolute unread count. Values <= 0 (or
 * non-finite) clear the badge. Safe to call from foreground effects and
 * from background headless JS tasks.
 */
export async function setAppBadgeCount(count: number): Promise<void> {
  const { client } = getNotifeeRuntime();
  if (!client?.setBadgeCount) {
    return;
  }

  const normalized =
    Number.isFinite(count) && count > 0 ? Math.round(count) : 0;

  try {
    await client.setBadgeCount(normalized);
  } catch (error) {
    // Unsupported launcher / detached native module — degrade silently but
    // leave a breadcrumb for diagnostics.
    notifyLog.warn?.("setAppBadgeCount failed", {
      count: normalized,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

/** Convenience wrapper to clear the badge (logout / data wipe). */
export async function clearAppBadge(): Promise<void> {
  await setAppBadgeCount(0);
}
