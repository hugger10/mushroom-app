/**
 * Display rules for message reaction capsules.
 *
 * The chat UI groups reactions by emoji and renders a row of "capsules" under
 * the message bubble. To match WhatsApp's behaviour we cap the row at a fixed
 * number of distinct emojis and use a `99+` upper bound when individual groups
 * (or the overflow total) get too large.
 */

/**
 * Maximum number of distinct emoji groups rendered inline on a message bubble.
 * Anything beyond this threshold is collapsed into a single overflow capsule
 * that exposes the total reaction count and opens the detail panel on tap.
 */
export const MAX_VISIBLE_REACTION_GROUPS = 3;

/**
 * Format a reaction count for the inline capsule row. Counts above 99 are
 * displayed as `99+` so the capsule width stays bounded; the detail panel is
 * still expected to show the real number.
 */
export function formatReactionCount(n: number): string {
  if (!Number.isFinite(n) || n <= 0) {
    return "0";
  }
  return n > 99 ? "99+" : String(Math.floor(n));
}
