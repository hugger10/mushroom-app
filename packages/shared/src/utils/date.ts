const DAY_OF_WEEK = [
  "星期日",
  "星期一",
  "星期二",
  "星期三",
  "星期四",
  "星期五",
  "星期六"
];

const pad = (n: number) => n.toString().padStart(2, "0");

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Calendar-day difference (b - a) at local time. Positive if b is after a.
 */
function diffCalendarDays(a: Date, b: Date): number {
  const aStart = startOfDay(a).getTime();
  const bStart = startOfDay(b).getTime();
  return Math.round((bStart - aStart) / (24 * 60 * 60 * 1000));
}

export function formatMessageTime(date?: string | Date | null): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "";
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatChatTimeUnified(date: Date | string): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();

  const dTime = d.getTime();
  const nowTime = now.getTime();

  const isYesterday = (target: Date) => {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    return isSameDay(target, yesterday);
  };

  if (isSameDay(d, now)) {
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  if (isYesterday(d)) {
    return `昨天 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  if ((nowTime - dTime) / (1000 * 3600 * 24) < 7) {
    return `${DAY_OF_WEEK[d.getDay()]} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  if (d.getFullYear() === now.getFullYear()) {
    return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
  }
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
}

export function formatLastActiveTime(value?: string | null) {
  if (!value) {
    return "最近活跃时间未知";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "最近活跃时间未知";
  }

  const now = Date.now();
  const diffMs = Math.max(0, now - date.getTime());
  const diffMinutes = Math.floor(diffMs / 60_000);
  if (diffMinutes <= 1) {
    return "刚刚活跃";
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} 分钟前活跃`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} 小时前活跃`;
  }

  const yesterday = new Date(now - 24 * 60 * 60 * 1000);
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  const sameMonth = date.getMonth() === yesterday.getMonth();
  const sameDate = date.getDate() === yesterday.getDate();
  const hh = date.getHours().toString().padStart(2, "0");
  const mm = date.getMinutes().toString().padStart(2, "0");

  if (sameYear && sameMonth && sameDate) {
    return `昨天 ${hh}:${mm} 活跃`;
  }

  return sameYear
    ? `${date.getMonth() + 1}月${date.getDate()}日 ${hh}:${mm} 活跃`
    : `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${hh}:${mm} 活跃`;
}

/**
 * Whether two timestamps fall on the same local calendar day.
 * Used by chat UIs to decide if a date separator is needed between
 * two adjacent messages.
 */
export function isSameLocalDay(
  a: string | number | Date | null | undefined,
  b: string | number | Date | null | undefined
): boolean {
  if (!a || !b) return false;
  const da = a instanceof Date ? a : new Date(a);
  const db = b instanceof Date ? b : new Date(b);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return false;
  return isSameDay(da, db);
}

export interface MessageDateLabels {
  today: string;
  yesterday: string;
  /** Index 0..6, Sunday..Saturday */
  weekdays: [string, string, string, string, string, string, string];
  /** Format for same-year, > 6 days ago. {{month}} 1..12, {{day}} 1..31. */
  sameYear: string;
  /** Format for cross-year. {{year}}/{{month}}/{{day}}. */
  otherYear: string;
}

export const DEFAULT_MESSAGE_DATE_LABELS: MessageDateLabels = {
  today: "今天",
  yesterday: "昨天",
  weekdays: ["周日", "周一", "周二", "周三", "周四", "周五", "周六"],
  sameYear: "{{month}}月{{day}}日",
  otherYear: "{{year}}年{{month}}月{{day}}日"
};

function applyTemplate(
  template: string,
  vars: Record<string, string | number>
): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) =>
    String(vars[key] ?? "")
  );
}

/**
 * WhatsApp-style date separator label for chat history grouping.
 *
 * Rules (relative to `now`, local time):
 * - same calendar day        -> labels.today          ("今天")
 * - 1 day ago                 -> labels.yesterday      ("昨天")
 * - 2..6 days ago             -> labels.weekdays[wd]   ("周一" ...)
 * - same year, > 6 days ago   -> labels.sameYear       ("4月1日")
 * - cross year                -> labels.otherYear      ("2024年4月1日")
 *
 * Returns an empty string for invalid input.
 */
export function formatMessageDateLabel(
  value: string | number | Date | null | undefined,
  now: Date = new Date(),
  labels: MessageDateLabels = DEFAULT_MESSAGE_DATE_LABELS
): string {
  if (value === null || value === undefined || value === "") return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";

  const diffDays = diffCalendarDays(d, now); // now - d in calendar days

  if (diffDays === 0) return labels.today;
  if (diffDays === 1) return labels.yesterday;
  if (diffDays >= 2 && diffDays <= 6) {
    return labels.weekdays[d.getDay()];
  }

  if (d.getFullYear() === now.getFullYear()) {
    return applyTemplate(labels.sameYear, {
      month: d.getMonth() + 1,
      day: d.getDate()
    });
  }
  return applyTemplate(labels.otherYear, {
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    day: d.getDate()
  });
}
