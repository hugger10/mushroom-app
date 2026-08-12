import type { PrivacySyncMessage } from "../types";
import { applyPrivacySyncFrame } from "../../hooks/useMyPrivacySettings";
import log from "@/utils/log";

/**
 * Handle non-persistent `privacy_sync` frames pushed when the user updates
 * privacy settings on another device. We merge into the singleton store
 * using version gating to ignore late / reordered frames.
 */
export function handlePrivacySyncMessage(message: PrivacySyncMessage) {
  const applied = applyPrivacySyncFrame({
    settings: message.settings,
    version: message.version,
    updated_at: message.updated_at
  });
  if (!applied) {
    log.debug("privacy_sync ignored (stale version):", message.version);
  }
}
