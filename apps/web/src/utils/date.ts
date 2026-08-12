export {
  formatMessageTime,
  formatChatTimeUnified,
  formatLastActiveTime,
  formatMessageDateLabel,
  isSameLocalDay,
  DEFAULT_MESSAGE_DATE_LABELS
} from "@mushroom/shared";
export type { MessageDateLabels } from "@mushroom/shared";

type DateFormat = "yyyy-MM-dd HH:mm:ss" | "yyyy-MM-dd" | "HH:mm:ss";

export function formatDateTime(
  dateInput?: Date | string | number,
  format: DateFormat = "yyyy-MM-dd HH:mm:ss"
): string {
  const date = dateInput ? new Date(dateInput) : new Date();

  const pad = (n: number) => (n < 10 ? "0" + n : n);

  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());

  switch (format) {
    case "yyyy-MM-dd HH:mm:ss":
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    case "yyyy-MM-dd":
      return `${year}-${month}-${day}`;
    case "HH:mm:ss":
      return `${hours}:${minutes}:${seconds}`;
    default:
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }
}

export function string2DateTime(value?: string | Date | null) {
  if (!value) {
    return "-";
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value instanceof Date ? "-" : value;
  }

  return date.toLocaleString();
}

export function formatDateTimeProfile(value?: string | null) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}
