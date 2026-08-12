import type { ContactListItem } from "../types/models";

/**
 * Fields used to detect whether a contact has meaningfully changed.
 *
 * `updated_at` is intentionally excluded because it can advance even when no
 * user-visible field actually changed (e.g. server side relation touch). Using
 * it here would defeat the purpose of the diff and cause spurious writes /
 * log noise on every reconnect.
 */
const CONTACT_COMPARE_FIELDS = [
  "username",
  "nickname",
  "remark_name",
  "remark_note",
  "avatar_url",
  "signature",
  "gender",
  "status",
  "is_blocked",
  "source"
] as const;

type ComparableField = (typeof CONTACT_COMPARE_FIELDS)[number];

function normalize(value: unknown): unknown {
  // Treat `undefined` and `null` as equivalent so that records loaded from
  // SQLite (which often returns `null`) match records mapped from the HTTP API
  // (which may use `undefined`).
  if (value === undefined) return null;
  return value;
}

/**
 * Returns true when any tracked field differs between the remote (source of
 * truth) and the locally cached contact. Used to skip UPDATE writes when the
 * record is already up to date.
 */
export function hasContactChanged(
  remote: ContactListItem,
  local: ContactListItem
): boolean {
  for (const field of CONTACT_COMPARE_FIELDS as readonly ComparableField[]) {
    if (normalize(remote[field]) !== normalize(local[field])) {
      return true;
    }
  }
  return false;
}

export { CONTACT_COMPARE_FIELDS };
