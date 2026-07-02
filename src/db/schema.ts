/**
 * Local schema migrations, applied by src/db/migrations.ts using
 * PRAGMA user_version. Append-only: never edit a shipped migration.
 *
 * Local rows mirror the remote model plus sync metadata (ARCHITECTURE §4):
 * server_version (last known remote version) and local_updated_at
 * (display/diagnostics only — never a sync cursor, D-008).
 */
export const LOCAL_MIGRATIONS: readonly string[] = [
  // v1 — initial offline schema
  `
  CREATE TABLE farms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    server_version INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE farm_members (
    id TEXT PRIMARY KEY,
    farm_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('owner', 'worker')),
    membership_status TEXT NOT NULL CHECK (membership_status IN ('active', 'inactive')),
    created_at TEXT NOT NULL,
    server_version INTEGER NOT NULL DEFAULT 0
  );
  CREATE UNIQUE INDEX farm_members_farm_user ON farm_members (farm_id, user_id);

  CREATE TABLE farm_invites (
    id TEXT PRIMARY KEY,
    farm_id TEXT NOT NULL,
    normalized_email TEXT NOT NULL,
    role TEXT NOT NULL,
    status TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    server_version INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE cows (
    id TEXT PRIMARY KEY,
    farm_id TEXT NOT NULL,
    name TEXT NOT NULL,
    tag_number TEXT,
    photo_path TEXT,
    photo_local_uri TEXT,
    birth_date TEXT,
    birth_date_is_estimated INTEGER NOT NULL DEFAULT 0,
    breed TEXT,
    mother_id TEXT,
    calving_count INTEGER NOT NULL DEFAULT 0,
    lifecycle_status TEXT NOT NULL DEFAULT 'active'
      CHECK (lifecycle_status IN ('active', 'sold', 'deceased', 'culled')),
    lactation_status TEXT NOT NULL DEFAULT 'unknown'
      CHECK (lactation_status IN ('lactating', 'dry', 'unknown')),
    pregnancy_status TEXT NOT NULL DEFAULT 'unknown'
      CHECK (pregnancy_status IN ('pregnant', 'open', 'unknown')),
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    deleted_at TEXT,
    server_version INTEGER NOT NULL DEFAULT 0,
    local_updated_at TEXT NOT NULL,
    CHECK (mother_id IS NULL OR mother_id <> id)
  );
  CREATE UNIQUE INDEX cows_unique_active_tag
    ON cows (farm_id, lower(trim(tag_number)))
    WHERE deleted_at IS NULL AND tag_number IS NOT NULL;
  CREATE INDEX cows_farm_idx ON cows (farm_id) WHERE deleted_at IS NULL;
  CREATE INDEX cows_mother_idx ON cows (mother_id);

  CREATE TABLE milk_records (
    id TEXT PRIMARY KEY,
    farm_id TEXT NOT NULL,
    cow_id TEXT NOT NULL,
    record_date TEXT NOT NULL,
    session TEXT NOT NULL CHECK (session IN ('morning', 'afternoon')),
    liters REAL NOT NULL CHECK (liters >= 0),
    recorded_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    deleted_at TEXT,
    server_version INTEGER NOT NULL DEFAULT 0,
    local_updated_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX milk_unique_active_session
    ON milk_records (farm_id, cow_id, record_date, session)
    WHERE deleted_at IS NULL;
  CREATE INDEX milk_cow_date_idx ON milk_records (cow_id, record_date DESC);
  CREATE INDEX milk_farm_date_idx ON milk_records (farm_id, record_date DESC);

  CREATE TABLE sync_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    farm_id TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    operation TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    next_attempt_at TEXT
  );
  CREATE INDEX sync_queue_farm_idx ON sync_queue (farm_id, id);

  CREATE TABLE sync_state (
    farm_id TEXT NOT NULL,
    scope TEXT NOT NULL,
    last_server_version INTEGER NOT NULL DEFAULT 0,
    last_success_at TEXT,
    last_error TEXT,
    PRIMARY KEY (farm_id, scope)
  );

  CREATE TABLE photo_upload_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    farm_id TEXT NOT NULL,
    cow_id TEXT NOT NULL,
    local_uri TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending', 'uploaded', 'failed')),
    attempt_count INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    next_attempt_at TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX photo_queue_status_idx ON photo_upload_queue (status, next_attempt_at);

  CREATE TABLE sync_conflicts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    farm_id TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    local_payload_json TEXT NOT NULL,
    server_payload_json TEXT,
    reason TEXT NOT NULL,
    created_at TEXT NOT NULL,
    resolved_at TEXT
  );
  CREATE INDEX sync_conflicts_open_idx ON sync_conflicts (farm_id)
    WHERE resolved_at IS NULL;

  CREATE TABLE app_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
];
