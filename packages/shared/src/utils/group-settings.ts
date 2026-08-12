import type { GroupConversationSettings } from "../types/models";

export function parseGroupConversationSettings(
  value?: string | GroupConversationSettings | null
): GroupConversationSettings {
  if (!value) {
    return {};
  }

  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value) as GroupConversationSettings;
  } catch {
    return {};
  }
}

export function stringifyGroupConversationSettings(
  value?: GroupConversationSettings | null
): string | undefined {
  if (!value) {
    return undefined;
  }
  return JSON.stringify(value);
}

/**
 * Best-effort conversion of a `muted_until` field (which may be Date,
 * ISO string, epoch ms number, null, undefined, or an unexpected value)
 * into milliseconds since epoch. Returns 0 when the input cannot be
 * parsed into a finite timestamp; callers should treat 0 as "not muted".
 */
export function parseMutedUntilMs(raw: unknown): number {
  if (raw == null || raw === "") return 0;
  if (raw instanceof Date) {
    const t = raw.getTime();
    return Number.isFinite(t) ? t : 0;
  }
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? raw : 0;
  }
  if (typeof raw === "string") {
    const t = new Date(raw).getTime();
    return Number.isFinite(t) ? t : 0;
  }
  return 0;
}
