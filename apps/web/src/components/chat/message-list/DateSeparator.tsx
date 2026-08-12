interface DateSeparatorProps {
  label: string;
}

/**
 * Centered "today / yesterday / 周X / 2024年1月1日" date divider.
 * The label is precomputed at the list level (date-grouping is a list-level scan).
 */
export function DateSeparator({ label }: DateSeparatorProps) {
  return (
    <div className="im-date-separator">
      <span className="im-date-separator-label">{label}</span>
    </div>
  );
}
