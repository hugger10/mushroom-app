import type { SyncCursorToken } from "@mushroom/shared";

export function encodeSyncCursor(cursor: SyncCursorToken | null | undefined) {
  if (!cursor?.updated_at || !cursor.entity_id) {
    return null;
  }

  return JSON.stringify(cursor);
}

export function decodeSyncCursor(cursor?: string | null) {
  if (!cursor) {
    return null;
  }

  try {
    const parsed = JSON.parse(cursor) as Partial<SyncCursorToken>;
    if (
      typeof parsed.updated_at === "string" &&
      typeof parsed.entity_id === "string"
    ) {
      return parsed as SyncCursorToken;
    }
  } catch {
    const parsedDate = new Date(cursor);
    if (!Number.isNaN(parsedDate.getTime())) {
      return {
        updated_at: parsedDate.toISOString(),
        entity_id: "0"
      } satisfies SyncCursorToken;
    }
  }

  return null;
}
