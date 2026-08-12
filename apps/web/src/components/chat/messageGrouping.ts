import type { Message } from "../../types/chat";

/**
 * Position of a message within a consecutive group from the same sender.
 * - alone: single message not grouped with others
 * - first: first message in a group
 * - middle: middle message in a group
 * - last: last message in a group
 */
export type BubbleGroupPosition = "alone" | "first" | "middle" | "last";

const GROUP_TIME_THRESHOLD_MS = 60_000; // 1 minute

/**
 * Compute grouping positions for a list of messages.
 * Messages are grouped when they are from the same sender, both are normal
 * messages (type === 1), neither is recalled, and the time gap is < threshold.
 */
export function computeMessageGroups(
  messages: Message[]
): Map<string, BubbleGroupPosition> {
  const result = new Map<string, BubbleGroupPosition>();

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const prev = i > 0 ? messages[i - 1] : null;
    const next = i < messages.length - 1 ? messages[i + 1] : null;

    const groupsWithPrev = prev !== null && canGroup(prev, msg);
    const groupsWithNext = next !== null && canGroup(msg, next);

    let position: BubbleGroupPosition;
    if (groupsWithPrev && groupsWithNext) {
      position = "middle";
    } else if (groupsWithPrev && !groupsWithNext) {
      position = "last";
    } else if (!groupsWithPrev && groupsWithNext) {
      position = "first";
    } else {
      position = "alone";
    }

    result.set(msg.client_message_id, position);
  }

  return result;
}

function canGroup(a: Message, b: Message): boolean {
  // Only group normal messages (type 1)
  if (a.type !== 1 || b.type !== 1) return false;
  // Same sender
  if (a.sender_id !== b.sender_id) return false;
  // Neither recalled
  if (a.is_recalled || b.is_recalled) return false;
  // Time gap < threshold
  const timeA = new Date(a.created_at).getTime();
  const timeB = new Date(b.created_at).getTime();
  if (Math.abs(timeB - timeA) >= GROUP_TIME_THRESHOLD_MS) return false;
  return true;
}
