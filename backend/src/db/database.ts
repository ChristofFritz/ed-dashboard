import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS journal_files (
  id INTEGER PRIMARY KEY,
  filename TEXT UNIQUE NOT NULL,
  byte_offset INTEGER NOT NULL DEFAULT 0,
  line_count INTEGER NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY,
  file_id INTEGER NOT NULL REFERENCES journal_files(id),
  line_no INTEGER NOT NULL,
  timestamp TEXT NOT NULL,
  event TEXT NOT NULL,
  json TEXT NOT NULL,
  UNIQUE(file_id, line_no)
);
CREATE INDEX IF NOT EXISTS idx_events_event_ts ON events(event, timestamp);
CREATE INDEX IF NOT EXISTS idx_events_ts ON events(timestamp);
CREATE TABLE IF NOT EXISTS edsm_cache (
  system_address INTEGER PRIMARY KEY,
  json TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);
`;

export function openDatabase(dbPath: string = config.dbPath): Database.Database {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.exec(SCHEMA);
  return db;
}
