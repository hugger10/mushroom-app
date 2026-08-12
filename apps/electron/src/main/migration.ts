import Database from "better-sqlite3";
import log from "../utils/log";

interface Migration {
  id: number;
  name: string;
  up: (db: Database.Database) => void;
}

const initSchemaMigration: Migration = {
  id: 1,
  name: "init_schema",
  up: db => {
    db.exec(`
      DROP TABLE IF EXISTS local_message_reactions;
      DROP TABLE IF EXISTS local_reaction_cursors;
      DROP TABLE IF EXISTS media_cache;
      DROP TABLE IF EXISTS local_conversation_members;
      DROP TABLE IF EXISTS local_conversations;
      DROP TABLE IF EXISTS contacts_cache;
      DROP TABLE IF EXISTS local_messages;
      DROP TABLE IF EXISTS sync_cursors;
      DROP TABLE IF EXISTS outgoing_messages;
      DROP TABLE IF EXISTS sync_backfill_jobs;

      CREATE TABLE local_conversations (
        client_conversation_id TEXT NOT NULL,
        server_conversation_id TEXT,
        type INTEGER,
        name TEXT,
        avatar_url TEXT,
        owner_id INTEGER,
        peer_id INTEGER,
        last_message_id TEXT,
        last_message_send_id INTEGER,
        last_message_content TEXT,
        last_message_time DATE DEFAULT CURRENT_TIMESTAMP,
        unread_count INTEGER NOT NULL DEFAULT 0,
        mention_unread_count INTEGER NOT NULL DEFAULT 0,
        last_sync_sequence INTEGER NOT NULL DEFAULT 0,
        last_server_sequence INTEGER NOT NULL DEFAULT 0,
        sync_gap_detected INTEGER NOT NULL DEFAULT 0,
        tail_loaded_from_seq INTEGER NOT NULL DEFAULT 0,
        tail_loaded_to_seq INTEGER NOT NULL DEFAULT 0,
        history_complete INTEGER NOT NULL DEFAULT 0,
        needs_backfill INTEGER NOT NULL DEFAULT 0,
        last_read_sequence INTEGER NOT NULL DEFAULT 0,
        peer_last_read_sequence INTEGER NOT NULL DEFAULT 0,
        status INTEGER NOT NULL DEFAULT 0,
        is_pinned INTEGER NOT NULL DEFAULT 0,
        is_muted INTEGER NOT NULL DEFAULT 0,
        is_archived INTEGER NOT NULL DEFAULT 0,
        description TEXT,
        settings TEXT,
        draft TEXT,
        local_hidden_before_seq INTEGER NOT NULL DEFAULT 0,
        is_locally_deleted INTEGER NOT NULL DEFAULT 0,
        updated_at DATE DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (client_conversation_id),
        UNIQUE (server_conversation_id)
      );

      CREATE TABLE local_conversation_members (
        conversation_id TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        nickname TEXT,
        avatar_url TEXT,
        role INTEGER,
        muted_until DATE,
        muted_by INTEGER,
        joined_at DATE,
        PRIMARY KEY (conversation_id, user_id)
      );

      CREATE TABLE contacts_cache (
        user_id INTEGER NOT NULL,
        username TEXT,
        nickname TEXT,
        remark_name TEXT,
        remark_note TEXT,
        avatar_url TEXT,
        gender INTEGER,
        is_blocked INTEGER NOT NULL DEFAULT 0,
        source TEXT,
        status TEXT,
        signature TEXT,
        blocked_at DATE,
        updated_at DATE,
        PRIMARY KEY (user_id)
      );

      CREATE TABLE local_messages (
        local_id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_message_id TEXT NOT NULL UNIQUE,
        server_message_id TEXT,
        client_conversation_id TEXT NOT NULL,
        sequence INTEGER,
        sender_id INTEGER,
        sender_nickname TEXT,
        sender_avatar TEXT,
        content TEXT,
        type INTEGER,
        created_at DATE DEFAULT CURRENT_TIMESTAMP,
        updated_at DATE DEFAULT CURRENT_TIMESTAMP,
        status INTEGER NOT NULL DEFAULT 0,
        is_recalled INTEGER NOT NULL DEFAULT 0,
        is_favorited INTEGER NOT NULL DEFAULT 0,
        is_pinned INTEGER NOT NULL DEFAULT 0,
        reply_to_message_id TEXT,
        reply_to_sender_id INTEGER,
        reply_to_sender_nickname TEXT,
        reply_to_text TEXT
      );

      CREATE TABLE sync_cursors (
        scope TEXT NOT NULL,
        entity_id TEXT NOT NULL DEFAULT '',
        cursor_type TEXT NOT NULL,
        cursor_value TEXT,
        updated_at DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (scope, entity_id)
      );

      CREATE TABLE outgoing_messages (
        client_message_id TEXT NOT NULL,
        client_conversation_id TEXT NOT NULL,
        server_conversation_id TEXT,
        payload TEXT NOT NULL,
        status INTEGER NOT NULL,
        retry_count INTEGER NOT NULL DEFAULT 0,
        next_retry_at DATE,
        last_error TEXT,
        created_at DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (client_message_id)
      );

      CREATE TABLE sync_backfill_jobs (
        client_conversation_id TEXT NOT NULL,
        job_kind TEXT NOT NULL,
        priority INTEGER NOT NULL DEFAULT 0,
        not_before_at DATE,
        payload TEXT,
        updated_at DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (client_conversation_id)
      );

      CREATE TABLE media_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        message_id TEXT,
        upload_id TEXT,
        remote_url TEXT,
        local_path TEXT NOT NULL,
        category TEXT NOT NULL,
        original_name TEXT,
        mime_type TEXT,
        size INTEGER,
        sha256 TEXT,
        month_key TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ready',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        accessed_at TEXT,
        client_conversation_id TEXT
      );

      CREATE TABLE local_message_reactions (
        client_message_id TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        emoji TEXT NOT NULL,
        created_at DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        sequence INTEGER NOT NULL DEFAULT 0,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (client_message_id, user_id),
        FOREIGN KEY (client_message_id)
          REFERENCES local_messages(client_message_id)
          ON DELETE CASCADE
      );

      CREATE TABLE local_reaction_cursors (
        client_conversation_id TEXT PRIMARY KEY,
        last_sequence INTEGER NOT NULL DEFAULT 0,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE local_group_read_states (
        server_conversation_id TEXT NOT NULL,
        reader_user_id INTEGER NOT NULL,
        last_read_seq INTEGER NOT NULL DEFAULT 0,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (server_conversation_id, reader_user_id)
      );

      CREATE INDEX idx_local_conversations_sort
      ON local_conversations(is_pinned DESC, last_message_time DESC);

      CREATE UNIQUE INDEX idx_local_messages_server_message_id
      ON local_messages(server_message_id)
      WHERE server_message_id IS NOT NULL AND server_message_id != '';

      CREATE UNIQUE INDEX idx_local_messages_conversation_sequence
      ON local_messages(client_conversation_id, sequence)
      WHERE sequence IS NOT NULL AND sequence > 0;

      CREATE INDEX idx_local_messages_conversation_created_at
      ON local_messages(client_conversation_id, created_at DESC);

      CREATE INDEX idx_local_messages_favorited
      ON local_messages(client_conversation_id, is_favorited, created_at DESC);

      CREATE INDEX idx_local_messages_pinned
      ON local_messages(client_conversation_id, is_pinned, created_at DESC);

      CREATE INDEX idx_outgoing_messages_status_retry
      ON outgoing_messages(status, next_retry_at);

      CREATE INDEX idx_sync_backfill_jobs_priority
      ON sync_backfill_jobs(priority DESC, updated_at ASC);

      CREATE INDEX idx_media_cache_user_id_month
      ON media_cache (user_id, month_key);

      CREATE INDEX idx_media_cache_message
      ON media_cache (message_id);

      CREATE UNIQUE INDEX idx_media_cache_remote_category
      ON media_cache (username, remote_url, category)
      WHERE remote_url IS NOT NULL;

      CREATE INDEX idx_media_cache_username_conv
      ON media_cache (username, client_conversation_id);

      CREATE INDEX idx_local_message_reactions_message
      ON local_message_reactions(client_message_id);

      CREATE INDEX idx_local_message_reactions_sequence
      ON local_message_reactions(client_message_id, sequence);

      CREATE INDEX idx_local_group_read_states_conversation
      ON local_group_read_states(server_conversation_id);
    `);
  }
};

const migrations: Migration[] = [initSchemaMigration];

export class MigrationRunner {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  private getAppliedVersion(): number {
    const row = this.db
      .prepare("SELECT MAX(id) as version FROM migrations")
      .get();
    return (row as { version: number })?.version || 0;
  }

  public up() {
    const currentVersion = this.getAppliedVersion();

    const pendingMigrations = migrations.filter(
      migration => migration.id > currentVersion
    );

    if (pendingMigrations.length === 0) {
      log.info("The database is up to date");
      this.db.close();
      return;
    }

    this.db.transaction(() => {
      for (const migration of pendingMigrations) {
        log.info(`migrating... #${migration.id} - ${migration.name}`);
        migration.up(this.db);
        this.db
          .prepare(
            `
              INSERT INTO migrations (id, name) VALUES (?, ?)
              ON CONFLICT(id) DO UPDATE SET name = excluded.name
            `
          )
          .run(migration.id, migration.name);
      }
    })();

    log.info("Migrated successfully");
    this.db.close();
  }
}
