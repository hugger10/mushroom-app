import { getMessageMentions, isMentioningAll } from "@mushroom/shared";
import { highlightSearchKeyword } from "./highlightSearchKeyword";

interface MentionTextProps {
  /** Raw message content (Record from server, may carry a `text` field). */
  content: Record<string, unknown>;
  /** Search keyword to highlight inside non-mention segments. Optional. */
  searchKeyword?: string;
}

/**
 * Render a message text with @user / @all mentions highlighted and the optional
 * search keyword highlighted inside the non-mention segments.
 *
 * Order: @all is matched first (single token), then each per-user mention by nickname.
 * Tightly fused with highlightSearchKeyword by design — split-then-highlight would
 * highlight `@kw` inside mention tokens incorrectly.
 */
export function MentionText({ content, searchKeyword }: MentionTextProps) {
  const text = String((content as { text?: unknown })?.text ?? content);
  const mentions = getMessageMentions(content);
  const mentionAll = isMentioningAll(content);

  if (mentions.length === 0 && !mentionAll) {
    return <>{highlightSearchKeyword(text, searchKeyword)}</>;
  }

  const segments: Array<{ text: string; highlighted: boolean; key: string }> =
    [];
  let cursor = 0;

  if (mentionAll) {
    const token = "@all";
    const start = text.indexOf(token, cursor);
    if (start !== -1) {
      if (start > cursor) {
        segments.push({
          text: text.slice(cursor, start),
          highlighted: false,
          key: `all-prefix-${cursor}`
        });
      }
      segments.push({
        text: token,
        highlighted: true,
        key: `mention-all-${start}`
      });
      cursor = start + token.length;
    }
  }

  mentions.forEach((mention, index) => {
    const token = `@${mention.nickname}`;
    const start = text.indexOf(token, cursor);
    if (start === -1) {
      return;
    }
    if (start > cursor) {
      segments.push({
        text: text.slice(cursor, start),
        highlighted: false,
        key: `plain-${index}-${cursor}`
      });
    }
    segments.push({
      text: token,
      highlighted: true,
      key: `mention-${mention.user_id}-${start}`
    });
    cursor = start + token.length;
  });

  if (cursor < text.length) {
    segments.push({
      text: text.slice(cursor),
      highlighted: false,
      key: `plain-tail-${cursor}`
    });
  }

  return (
    <>
      {segments.map(segment => (
        <span
          key={segment.key}
          className={segment.highlighted ? "im-mention-highlight" : undefined}
        >
          {segment.highlighted
            ? segment.text
            : highlightSearchKeyword(segment.text, searchKeyword)}
        </span>
      ))}
    </>
  );
}
