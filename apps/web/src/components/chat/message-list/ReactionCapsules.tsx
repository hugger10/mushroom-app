import { useMemo } from "react";
import {
  formatReactionCount,
  MAX_VISIBLE_REACTION_GROUPS,
  type MessageReactionEntry
} from "@mushroom/shared";
import { groupReactions } from "./messageListUtils";

interface ReactionCapsulesProps {
  reactions: MessageReactionEntry[] | undefined;
  currentUserId: number | null | undefined;
  isOwn: boolean;
  onOpenDetail: () => void;
}

/**
 * Pills under a chat bubble showing reaction counts. Clicking opens the
 * reaction-detail modal (parent provides the handler).
 */
export function ReactionCapsules({
  reactions,
  currentUserId,
  isOwn,
  onOpenDetail
}: ReactionCapsulesProps) {
  const groups = useMemo(
    () => groupReactions(reactions, currentUserId),
    [reactions, currentUserId]
  );
  if (groups.length === 0) return null;
  const totalCount = groups.reduce((sum, g) => sum + g.count, 0);
  const visibleGroups = groups.slice(0, MAX_VISIBLE_REACTION_GROUPS);
  const hasOverflow = groups.length > MAX_VISIBLE_REACTION_GROUPS;
  return (
    <div
      className="im-message-reactions"
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 3,
        marginTop: -4,
        marginLeft: isOwn ? 0 : 8,
        marginRight: isOwn ? 8 : 0,
        position: "relative",
        zIndex: 2,
        justifyContent: isOwn ? "flex-end" : "flex-start"
      }}
    >
      {visibleGroups.map(group => (
        <button
          key={group.emoji}
          type="button"
          onClick={onOpenDetail}
          className={`im-message-reaction-capsule${
            group.mine ? " im-message-reaction-capsule-mine" : ""
          }`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 3,
            padding: "2px 6px",
            borderRadius: 11,
            background: "#ffffff",
            border: group.mine
              ? "1px solid rgba(22,119,255,0.32)"
              : "1px solid rgba(0,0,0,0.12)",
            color: "inherit",
            cursor: "pointer",
            fontSize: 11,
            lineHeight: "14px"
          }}
        >
          <span style={{ fontSize: 13 }}>{group.emoji}</span>
          {group.count > 1 ? (
            <span style={{ fontWeight: 500 }}>
              {formatReactionCount(group.count)}
            </span>
          ) : null}
        </button>
      ))}
      {hasOverflow ? (
        <button
          key="__reaction_overflow__"
          type="button"
          onClick={onOpenDetail}
          className="im-message-reaction-capsule"
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "0 6px",
            borderRadius: 11,
            background: "#ffffff",
            border: "1px solid rgba(0,0,0,0.12)",
            color: "inherit",
            cursor: "pointer",
            fontSize: 11,
            lineHeight: "14px",
            fontWeight: 500
          }}
        >
          {formatReactionCount(totalCount)}
        </button>
      ) : null}
    </div>
  );
}
