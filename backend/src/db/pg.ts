import pg from 'pg';
import { config } from '../config.js';

const { Pool } = pg;

// Journal `timestamp` and event `json` are strings; keep BIGINT as JS number
// (system addresses / market ids fit in 2^53). pg returns BIGINT as string by
// default — override so our numeric columns come back as numbers.
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));

export type Db = pg.Pool;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ingest_tokens (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label        TEXT NOT NULL,
  token_hash   TEXT UNIQUE NOT NULL,
  suffix       TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS journal_files (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename   TEXT NOT NULL,
  line_count INTEGER NOT NULL DEFAULT 0,
  completed  BOOLEAN NOT NULL DEFAULT false,
  UNIQUE(user_id, filename)
);

CREATE TABLE IF NOT EXISTS events (
  id        BIGSERIAL PRIMARY KEY,
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_id   INTEGER NOT NULL REFERENCES journal_files(id) ON DELETE CASCADE,
  line_no   INTEGER NOT NULL,
  timestamp TEXT NOT NULL,
  event     TEXT NOT NULL,
  json      TEXT NOT NULL,
  UNIQUE(file_id, line_no)
);
CREATE INDEX IF NOT EXISTS idx_events_user_event_ts ON events(user_id, event, timestamp);
CREATE INDEX IF NOT EXISTS idx_events_user_ts ON events(user_id, timestamp);

CREATE TABLE IF NOT EXISTS edsm_cache (
  system_address BIGINT PRIMARY KEY,
  json           TEXT NOT NULL,
  fetched_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS capi_tokens (
  user_id       INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  access_token  TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  obtained_at   BIGINT NOT NULL,
  expires_in    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS meta (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key     TEXT NOT NULL,
  value   TEXT,
  PRIMARY KEY(user_id, key)
);
`;

let pool: Db | null = null;

export function getDb(): Db {
  if (!pool) pool = new Pool({ connectionString: config.databaseUrl });
  return pool;
}

/** Create tables if missing. Retries because Postgres may still be booting. */
export async function migrate(db: Db = getDb()): Promise<void> {
  const attempts = 30;
  for (let i = 0; i < attempts; i++) {
    try {
      await db.query(SCHEMA);
      return;
    } catch (err) {
      if (i === attempts - 1) throw err;
      console.log(`waiting for postgres (${i + 1}/${attempts})…`);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}
