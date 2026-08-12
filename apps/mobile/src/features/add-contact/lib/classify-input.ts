/**
 * Classify the user's add-contact input to decide which backend lookup
 * strategy to use.
 *
 *   - `e164`      : `+<digits>` matching E.164. Use lookup-phone only.
 *   - `ambiguous` : pure digits (no leading +). Could be a phone in national
 *                   format OR a numeric username/ID. Try BOTH endpoints and
 *                   merge results.
 *   - `keyword`   : everything else (contains letters, `_`, `@`, etc).
 *                   Use search only.
 */
export type InputKind =
  | { kind: "e164"; phoneE164: string }
  | { kind: "ambiguous"; raw: string }
  | { kind: "keyword"; raw: string };

const E164_REGEX = /^\+[1-9]\d{6,14}$/;
const PURE_DIGITS_REGEX = /^\d+$/;

export function classifyAddContactInput(raw: string): InputKind {
  const trimmed = raw.trim().replace(/[\s-]/g, "");
  if (!trimmed) {
    return { kind: "keyword", raw: "" };
  }
  if (E164_REGEX.test(trimmed)) {
    return { kind: "e164", phoneE164: trimmed };
  }
  if (PURE_DIGITS_REGEX.test(trimmed)) {
    // Pure-digit inputs without a leading "+" are ambiguous: could be a phone
    // number in national format OR a numeric username/ID. Run both lookups
    // and merge so that neither flow loses results.
    return { kind: "ambiguous", raw: trimmed };
  }
  return { kind: "keyword", raw: raw.trim() };
}
