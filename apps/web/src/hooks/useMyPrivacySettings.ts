/**
 * Global, lightweight store of the logged-in user's own privacy settings.
 *
 * Why this is a module-level singleton (not React Context):
 * - Multiple unrelated components (MessageList, ConversationList) plus the
 *   WS handler all need read/write access. A Context provider would force
 *   every consumer through the same tree and re-render every subscriber
 *   on each update; this minimal pub/sub keeps the blast radius small.
 * - We intentionally do NOT extend the `LoginUser` auth payload with
 *   privacy fields (Q3=A): auth state stays pure, privacy stays a
 *   separately fetched + WS-synced resource.
 *
 * Source-of-truth ordering:
 * 1. Initial fetch via GET /api/user/privacy (login or hook mount).
 * 2. WS `privacy_sync` frames (multi-device live update). Late / out-of-order
 *    frames are filtered via shared `applyPrivacyVersion`.
 *
 * The read-receipts UI gate (`isReceiptsEnabled`) is the only consumer we
 * surface here today; expand the selector if more fields are needed.
 */
import { useEffect, useState } from "react";
import {
  applyPrivacyVersion,
  isReadReceiptsEnabled,
  type UserPrivacySettings,
  type UserPrivacySettingsEnvelope
} from "@mushroom/shared";
import { getPrivacySettings } from "../http/api";
import log from "../utils/log";

type Listener = (envelope: UserPrivacySettingsEnvelope | null) => void;

let current: UserPrivacySettingsEnvelope | null = null;
const listeners = new Set<Listener>();
let fetchPromise: Promise<void> | null = null;

function emit() {
  for (const l of listeners) {
    try {
      l(current);
    } catch (err) {
      log.warn("privacy listener error", err);
    }
  }
}

/**
 * Replace store with server envelope (initial fetch result).
 * Bypasses version check because the server response is authoritative.
 */
export function setMyPrivacyEnvelope(env: UserPrivacySettingsEnvelope) {
  current = env;
  emit();
}

/**
 * Apply an incoming `privacy_sync` WS frame, dropping stale versions.
 * Returns true if the store was updated.
 */
export function applyPrivacySyncFrame(frame: {
  settings: UserPrivacySettings;
  version: number;
  updated_at: string;
}): boolean {
  const next = applyPrivacyVersion(current, frame);
  if (next === current) {
    return false;
  }
  current = next;
  emit();
  return true;
}

export function getMyPrivacyEnvelope(): UserPrivacySettingsEnvelope | null {
  return current;
}

export function clearMyPrivacy() {
  if (current === null) return;
  current = null;
  emit();
}

/**
 * Ensure we've fetched the settings at least once for this session.
 * Idempotent: concurrent callers share one in-flight request.
 */
export function ensureMyPrivacyLoaded(): Promise<void> {
  if (current) return Promise.resolve();
  if (fetchPromise) return fetchPromise;
  fetchPromise = getPrivacySettings()
    .then(result => {
      if (result?.data) {
        setMyPrivacyEnvelope(result.data);
      }
    })
    .catch((err: unknown) => {
      log.warn("getPrivacySettings failed", err);
    })
    .finally(() => {
      fetchPromise = null;
    });
  return fetchPromise;
}

/**
 * React hook returning a stable snapshot of the user's privacy envelope.
 * Auto-fetches on first mount if the store is empty.
 */
export function useMyPrivacySettings(): UserPrivacySettingsEnvelope | null {
  const [snapshot, setSnapshot] = useState(current);
  useEffect(() => {
    const listener: Listener = next => setSnapshot(next);
    listeners.add(listener);
    void ensureMyPrivacyLoaded();
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return snapshot;
}

/**
 * Convenience selector: is the local user willing to surface read receipts?
 * Defaults to TRUE when settings haven't loaded yet, matching server default
 * (read_receipts_visibility = 0). Avoids a UI flash that would briefly hide
 * the ✓✓ icon on initial mount.
 */
export function useIsReceiptsEnabled(): boolean {
  const env = useMyPrivacySettings();
  return isReadReceiptsEnabled(env?.settings ?? null);
}
