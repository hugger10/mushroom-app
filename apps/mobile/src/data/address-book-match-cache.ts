import {
  getMobileSQLiteConnection,
  onMobileSQLiteReset
} from "./sqlite-connection";

export interface AddressBookMatchCacheEntry {
  phone_e164: string;
  local_display_name: string;
  matched_user_id: number;
  nickname: string;
  username: string;
  avatar_url?: string | null;
  matched_at: string;
}

let initialized = false;

onMobileSQLiteReset(() => {
  initialized = false;
});

export async function ensureAddressBookMatchCache() {
  if (initialized) {
    return;
  }

  await getMobileSQLiteConnection().executeAsync(`
    CREATE TABLE IF NOT EXISTS address_book_match_cache (
      phone_e164 TEXT PRIMARY KEY,
      local_display_name TEXT,
      matched_user_id INTEGER NOT NULL,
      nickname TEXT,
      username TEXT,
      avatar_url TEXT,
      matched_at TEXT NOT NULL
    )
  `);
  initialized = true;
}

export async function loadAddressBookMatchCache(): Promise<
  AddressBookMatchCacheEntry[]
> {
  await ensureAddressBookMatchCache();
  const result = await getMobileSQLiteConnection().executeAsync(
    `SELECT
       phone_e164,
       local_display_name,
       matched_user_id,
       nickname,
       username,
       avatar_url,
       matched_at
     FROM address_book_match_cache
     ORDER BY matched_at DESC, local_display_name ASC`
  );

  return (result.results ?? []).map(row => ({
    phone_e164: String(row.phone_e164),
    local_display_name: String(row.local_display_name || ""),
    matched_user_id: Number(row.matched_user_id),
    nickname: String(row.nickname || ""),
    username: String(row.username || ""),
    avatar_url: row.avatar_url ? String(row.avatar_url) : null,
    matched_at: String(row.matched_at)
  }));
}

export async function replaceAddressBookMatchCache(
  entries: AddressBookMatchCacheEntry[]
) {
  await ensureAddressBookMatchCache();
  const db = getMobileSQLiteConnection();
  await db.executeAsync("DELETE FROM address_book_match_cache");

  for (const entry of entries) {
    await db.executeAsync(
      `INSERT INTO address_book_match_cache (
         phone_e164,
         local_display_name,
         matched_user_id,
         nickname,
         username,
         avatar_url,
         matched_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.phone_e164,
        entry.local_display_name,
        entry.matched_user_id,
        entry.nickname,
        entry.username,
        entry.avatar_url ?? null,
        entry.matched_at
      ]
    );
  }
}
