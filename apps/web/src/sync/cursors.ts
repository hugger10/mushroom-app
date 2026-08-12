export function serializeSyncCursor(syncCursor?: Date | string) {
  if (!syncCursor) return undefined;
  return syncCursor instanceof Date ? syncCursor.toISOString() : syncCursor;
}
