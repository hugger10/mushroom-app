import type { MobileMessageSearchResult } from "@mushroom/app-core";
import { i18n } from "../../../i18n";

export const MEDIA_COLUMNS = 3;

export type MediaSection = {
  title: string;
  sortKey: number;
  data: Array<Array<MobileMessageSearchResult | null>>;
};

export type FileSection = {
  title: string;
  sortKey: number;
  data: MobileMessageSearchResult[];
};

export function formatMonthLabel(rawDate: string): string {
  const date = new Date(rawDate);
  if (Number.isNaN(date.getTime())) {
    return i18n.t("chatMedia.unknownDate");
  }
  return i18n.t("chatMedia.monthLabel", {
    year: date.getFullYear(),
    month: date.getMonth() + 1
  });
}

export function monthSortKey(rawDate: string): number {
  const date = new Date(rawDate);
  if (Number.isNaN(date.getTime())) {
    return 0;
  }
  return date.getFullYear() * 100 + (date.getMonth() + 1);
}

export function chunkInto<T>(items: T[], size: number): Array<Array<T | null>> {
  const rows: Array<Array<T | null>> = [];
  for (let i = 0; i < items.length; i += size) {
    const slice: Array<T | null> = items.slice(i, i + size);
    while (slice.length < size) {
      slice.push(null);
    }
    rows.push(slice);
  }
  return rows;
}

function monthKey(rawDate: string): string {
  const d = new Date(rawDate);
  if (Number.isNaN(d.getTime())) {
    return "unknown";
  }
  return `${d.getFullYear()}-${d.getMonth() + 1}`;
}

/**
 * Group attachment results by month, newest month first. Each bucket is
 * additionally sorted newest-first by `created_at`.
 */
export function bucketByMonth(items: MobileMessageSearchResult[]): Array<{
  title: string;
  sortKey: number;
  items: MobileMessageSearchResult[];
}> {
  const buckets = new Map<
    string,
    { title: string; sortKey: number; items: MobileMessageSearchResult[] }
  >();
  for (const item of items) {
    const created = item.message.created_at;
    const key = monthKey(created);
    if (!buckets.has(key)) {
      buckets.set(key, {
        title: formatMonthLabel(created),
        sortKey: monthSortKey(created),
        items: []
      });
    }
    buckets.get(key)!.items.push(item);
  }
  return Array.from(buckets.values())
    .sort((a, b) => b.sortKey - a.sortKey)
    .map(bucket => {
      bucket.items.sort((a, b) => {
        const ta = new Date(a.message.created_at).getTime() || 0;
        const tb = new Date(b.message.created_at).getTime() || 0;
        return tb - ta;
      });
      return bucket;
    });
}

export function buildMediaSections(
  items: MobileMessageSearchResult[]
): MediaSection[] {
  return bucketByMonth(items).map(bucket => ({
    title: bucket.title,
    sortKey: bucket.sortKey,
    data: chunkInto(bucket.items, MEDIA_COLUMNS)
  }));
}

export function buildFileSections(
  items: MobileMessageSearchResult[]
): FileSection[] {
  return bucketByMonth(items).map(bucket => ({
    title: bucket.title,
    sortKey: bucket.sortKey,
    data: bucket.items
  }));
}
