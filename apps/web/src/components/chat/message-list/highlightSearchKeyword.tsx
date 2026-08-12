import type { ReactNode } from "react";

/**
 * Highlight occurrences of `keyword` (case-insensitive) inside `text`.
 * Lives in its own .tsx file so it can be re-used by multiple components
 * without tripping react-refresh's "only export components" rule.
 */
export function highlightSearchKeyword(
  text: string,
  keyword: string | undefined
): ReactNode {
  const kw = (keyword ?? "").trim();
  if (!kw) {
    return text;
  }
  const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "ig"));
  if (parts.length === 1) {
    return text;
  }
  return parts.map((part, i) =>
    part.toLowerCase() === kw.toLowerCase() ? (
      <mark key={`sh-${i}`} className="im-search-highlight">
        {part}
      </mark>
    ) : (
      <span key={`sp-${i}`}>{part}</span>
    )
  );
}
