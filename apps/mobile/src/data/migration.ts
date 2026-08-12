import type {
  NitroSQLiteConnection,
  QueryResult,
  QueryResultRow,
  Transaction
} from "react-native-nitro-sqlite";
import log from "../utils/log";

const migrationLog = log.scope("mobile-migration");

/**
 * Mobile SQLite migration runner.
 *
 * Mirrors the Electron-side `MigrationRunner` (apps/electron/src/main/migration.ts)
 * but adapted for the async nitro-sqlite API:
 *  - Each migration runs inside its own `db.transaction(...)` so a failure
 *    only rolls back that migration, leaving previously-applied ones intact.
 *  - Migrations are appended to `migrations` and executed in ascending id order.
 *  - Applied migrations are recorded in `mobile_migrations` (id, name, applied_at).
 *
 * Baseline-alignment (decision Q1=A):
 *   Pre-migration installs already have the schema (built by the old
 *   `ensureSchema()`), but no `mobile_migrations` table. To avoid re-running
 *   the init migration on those installs, the runner detects the presence of
 *   an existing legacy table (`mobile_conversations`) and, if it is the very
 *   first run of the runner, marks id=1 as already applied without executing
 *   its SQL.
 */

export interface Migration {
  id: number;
  name: string;
  up: (tx: Transaction) => Promise<void>;
}

const initSchemaMigration: Migration = {
  id: 1,
  name: "init_schema",
  up: async tx => {
    await tx.executeAsync(`
      CREATE TABLE IF NOT EXISTS mobile_contacts (
        user_id INTEGER PRIMARY KEY,
        sort_name TEXT NOT NULL,
        payload TEXT NOT NULL
      )
    `);

    await tx.executeAsync(`
      CREATE TABLE IF NOT EXISTS mobile_conversations (
        client_conversation_id TEXT PRIMARY KEY,
        server_conversation_id TEXT NOT NULL,
        last_message_time TEXT,
        is_pinned INTEGER NOT NULL DEFAULT 0,
        is_archived INTEGER NOT NULL DEFAULT 0,
        payload TEXT NOT NULL
      )
    `);

    // One-off dedup: rows sharing the same server_conversation_id created by
    // a race between ensureDirectConversation and syncNow. Keep the
    // earliest-inserted row (smallest rowid) and remove the rest.
    await tx.executeAsync(`
      DELETE FROM mobile_conversations
      WHERE rowid NOT IN (
        SELECT MIN(rowid)
        FROM mobile_conversations
        GROUP BY server_conversation_id
      )
    `);

    // Replace the legacy non-unique index with a partial unique index so the
    // dedup above cannot be reintroduced.
    await tx.executeAsync(
      `DROP INDEX IF EXISTS idx_mobile_conversations_server`
    );
    await tx.executeAsync(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_mobile_conversations_server
      ON mobile_conversations (server_conversation_id)
      WHERE server_conversation_id IS NOT NULL AND server_conversation_id <> ''
    `);

    await tx.executeAsync(`
      CREATE TABLE IF NOT EXISTS mobile_messages (
        client_message_id TEXT PRIMARY KEY,
        server_message_id TEXT,
        client_conversation_id TEXT NOT NULL,
        sequence INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT '',
        payload TEXT NOT NULL
      )
    `);
    await tx.executeAsync(`
      CREATE INDEX IF NOT EXISTS idx_mobile_messages_conversation
      ON mobile_messages (client_conversation_id, sequence, created_at)
    `);
    await tx.executeAsync(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_mobile_messages_server
      ON mobile_messages (server_message_id)
      WHERE server_message_id IS NOT NULL AND server_message_id <> ''
    `);

    await tx.executeAsync(`
      CREATE TABLE IF NOT EXISTS mobile_message_states (
        message_id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        is_favorited INTEGER NOT NULL DEFAULT 0,
        is_pinned INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        payload TEXT NOT NULL
      )
    `);
    await tx.executeAsync(`
      CREATE INDEX IF NOT EXISTS idx_mobile_message_states_conversation
      ON mobile_message_states (conversation_id, updated_at)
    `);

    await tx.executeAsync(`
      CREATE TABLE IF NOT EXISTS mobile_message_reactions (
        message_id TEXT NOT NULL,
        conversation_id TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        emoji TEXT NOT NULL,
        sequence INTEGER NOT NULL DEFAULT 0,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (message_id, user_id)
      )
    `);
    // Best-effort additive migration for installs that pre-date the
    // reaction-delta protocol. SQLite raises on duplicate ADD COLUMN; swallow
    // individually so a single failure doesn't abort the rest of the body.
    // NOTE: a thrown SQL error here would abort the surrounding transaction,
    // so we MUST catch — even though baseline-alignment usually skips this
    // migration for pre-existing installs.
    try {
      await tx.executeAsync(
        `ALTER TABLE mobile_message_reactions ADD COLUMN sequence INTEGER NOT NULL DEFAULT 0`
      );
    } catch {
      // column already exists
    }
    try {
      await tx.executeAsync(
        `ALTER TABLE mobile_message_reactions ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0`
      );
    } catch {
      // column already exists
    }
    await tx.executeAsync(`
      CREATE INDEX IF NOT EXISTS idx_mobile_message_reactions_message
      ON mobile_message_reactions (message_id, updated_at)
    `);
    await tx.executeAsync(`
      CREATE INDEX IF NOT EXISTS idx_mobile_message_reactions_conversation
      ON mobile_message_reactions (conversation_id, updated_at)
    `);
    await tx.executeAsync(`
      CREATE INDEX IF NOT EXISTS idx_mobile_message_reactions_sequence
      ON mobile_message_reactions (conversation_id, sequence)
    `);

    await tx.executeAsync(`
      CREATE TABLE IF NOT EXISTS mobile_reaction_cursors (
        client_conversation_id TEXT PRIMARY KEY,
        sequence INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT ''
      )
    `);

    await tx.executeAsync(`
      CREATE TABLE IF NOT EXISTS mobile_group_read_states (
        server_conversation_id TEXT NOT NULL,
        reader_user_id INTEGER NOT NULL,
        last_read_seq INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (server_conversation_id, reader_user_id)
      )
    `);
    await tx.executeAsync(`
      CREATE INDEX IF NOT EXISTS idx_mobile_group_read_states_conversation
      ON mobile_group_read_states (server_conversation_id)
    `);
  }
};

const addGroupReadStateCacheMigration: Migration = {
  id: 2,
  name: "group_read_state_cache",
  up: async tx => {
    await tx.executeAsync(`
      CREATE TABLE IF NOT EXISTS mobile_group_read_states (
        server_conversation_id TEXT NOT NULL,
        reader_user_id INTEGER NOT NULL,
        last_read_seq INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (server_conversation_id, reader_user_id)
      )
    `);
    await tx.executeAsync(`
      CREATE INDEX IF NOT EXISTS idx_mobile_group_read_states_conversation
      ON mobile_group_read_states (server_conversation_id)
    `);
  }
};

export const migrations: Migration[] = [
  initSchemaMigration,
  addGroupReadStateCacheMigration
];

function rowsFromResult<Row extends QueryResultRow>(
  result: QueryResult<Row>
): Row[] {
  return (result.results as Row[] | undefined) ?? result.rows?._array ?? [];
}

async function ensureMigrationsTable(db: NitroSQLiteConnection) {
  await db.executeAsync(`
    CREATE TABLE IF NOT EXISTS mobile_migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

async function getAppliedVersion(db: NitroSQLiteConnection): Promise<number> {
  const result = await db.executeAsync(
    `SELECT MAX(id) as version FROM mobile_migrations`
  );
  const rows = rowsFromResult(result);
  return Number(rows[0]?.version || 0);
}

async function isMigrationsTableEmpty(
  db: NitroSQLiteConnection
): Promise<boolean> {
  const result = await db.executeAsync(
    `SELECT COUNT(*) as count FROM mobile_migrations`
  );
  const rows = rowsFromResult(result);
  return Number(rows[0]?.count || 0) === 0;
}

async function hasLegacySchema(db: NitroSQLiteConnection): Promise<boolean> {
  // We sniff a single representative table (mobile_conversations) — any
  // install that ran the old ensureSchema() will have it. Keeping the
  // detection narrow (Q1 risk note in the design doc) avoids false
  // positives on partial schemas.
  const result = await db.executeAsync(
    `SELECT name FROM sqlite_master
     WHERE type = 'table' AND name = 'mobile_conversations'
     LIMIT 1`
  );
  const rows = rowsFromResult(result);
  return rows.length > 0;
}

async function recordMigration(
  db: NitroSQLiteConnection,
  migration: Migration
) {
  await db.executeAsync(
    `INSERT INTO mobile_migrations (id, name, applied_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET name = excluded.name`,
    [migration.id, migration.name]
  );
}

export async function runMobileMigrations(
  db: NitroSQLiteConnection
): Promise<void> {
  await ensureMigrationsTable(db);

  // Baseline-alignment for pre-migration installs: if the version table is
  // empty but the legacy schema is already present, mark id=1 as applied
  // without re-running its SQL. New installs (no legacy table) fall through
  // and execute every migration normally.
  if (await isMigrationsTableEmpty(db)) {
    if (await hasLegacySchema(db)) {
      await recordMigration(db, initSchemaMigration);
      migrationLog.info("baseline-aligned existing install at id=1");
    }
  }

  const currentVersion = await getAppliedVersion(db);
  const pending = migrations
    .filter(m => m.id > currentVersion)
    .sort((a, b) => a.id - b.id);

  if (pending.length === 0) {
    migrationLog.info("database is up to date");
    return;
  }

  for (const migration of pending) {
    migrationLog.info(`migrating... #${migration.id} - ${migration.name}`);
    try {
      // Per-migration transaction: failure rolls back this migration only,
      // leaving previously-applied migrations intact. The version-row write
      // is included so the apply is atomic with the schema change.
      await db.transaction(async tx => {
        await migration.up(tx);
        await tx.executeAsync(
          `INSERT INTO mobile_migrations (id, name, applied_at)
           VALUES (?, ?, datetime('now'))
           ON CONFLICT(id) DO UPDATE SET name = excluded.name`,
          [migration.id, migration.name]
        );
      });
    } catch (error) {
      migrationLog.error(
        `failed at #${migration.id} - ${migration.name}`,
        error
      );
      throw error;
    }
  }

  migrationLog.info("migrated successfully");
}
