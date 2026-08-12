import type { UserProfile } from "@mushroom/shared";

// Module-level cache of resolved user profiles keyed by userId. Lets the
// screen render the final nickname/username/avatar immediately on subsequent
// opens (and across closes within the same app session), avoiding the visible
// "fallback → server value" switch when the profile resolves asynchronously.
export const profileCache = new Map<number, UserProfile>();
