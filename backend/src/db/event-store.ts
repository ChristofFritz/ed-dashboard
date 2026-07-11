import type { Database, Statement } from 'better-sqlite3';
import type { TailBatch } from '../journal/tailer.js';

export interface JournalFileRow {
  id: number;
  filename: string;
  byte_offset: number;
  line_count: number;
  completed: number;
}

export class EventStore {
  private stGetFile: Statement;
  private stInsertFile: Statement;
  private stInsertEvent: Statement;
  private stUpdateOffset: Statement;
  private stMarkCompleted: Statement;
  private txWriteBatch: (batch: TailBatch) => void;

  constructor(private db: Database) {
    this.stGetFile = db.prepare('SELECT * FROM journal_files WHERE filename = ?');
    this.stInsertFile = db.prepare('INSERT INTO journal_files (filename) VALUES (?)');
    this.stInsertEvent = db.prepare(
      'INSERT OR IGNORE INTO events (file_id, line_no, timestamp, event, json) VALUES (?, ?, ?, ?, ?)',
    );
    this.stUpdateOffset = db.prepare(
      'UPDATE journal_files SET byte_offset = ?, line_count = ? WHERE id = ?',
    );
    this.stMarkCompleted = db.prepare('UPDATE journal_files SET completed = 1 WHERE filename = ?');

    this.txWriteBatch = db.transaction((batch: TailBatch) => {
      const file = this.getOrCreateFile(batch.filename);
      let lastLineNo = file.line_count;
      for (const { lineNo, raw, event } of batch.events) {
        this.stInsertEvent.run(file.id, lineNo, event.timestamp, event.event, raw);
        lastLineNo = Math.max(lastLineNo, lineNo);
      }
      this.stUpdateOffset.run(batch.newOffset, lastLineNo, file.id);
    });
  }

  getOrCreateFile(filename: string): JournalFileRow {
    const row = this.stGetFile.get(filename) as JournalFileRow | undefined;
    if (row) return row;
    this.stInsertFile.run(filename);
    return this.stGetFile.get(filename) as JournalFileRow;
  }

  getFile(filename: string): JournalFileRow | undefined {
    return this.stGetFile.get(filename) as JournalFileRow | undefined;
  }

  /** Insert a batch of events and advance the file offset atomically. */
  writeBatch(batch: TailBatch): void {
    this.txWriteBatch(batch);
  }

  markCompleted(filename: string): void {
    this.stMarkCompleted.run(filename);
  }

  allFiles(): JournalFileRow[] {
    return this.db.prepare('SELECT * FROM journal_files ORDER BY filename').all() as JournalFileRow[];
  }

  eventCount(): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM events').get() as { n: number }).n;
  }

  /** All events of one file in line order (for hydration replay). */
  eventsForFile(filename: string): string[] {
    return (
      this.db
        .prepare(
          'SELECT json FROM events JOIN journal_files ON journal_files.id = events.file_id ' +
            'WHERE journal_files.filename = ? ORDER BY line_no',
        )
        .all(filename) as { json: string }[]
    ).map((r) => r.json);
  }

  getMeta(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  }

  setMeta(key: string, value: string): void {
    this.db
      .prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(key, value);
  }

  /** All events of a given type across all files, oldest first. */
  eventsOfType(event: string): string[] {
    return (
      this.db
        .prepare('SELECT json FROM events WHERE event = ? ORDER BY timestamp, id')
        .all(event) as { json: string }[]
    ).map((r) => r.json);
  }

  /** Latest event of a given type across all files (by timestamp). */
  latestEvent<T = unknown>(event: string): T | null {
    const row = this.db
      .prepare('SELECT json FROM events WHERE event = ? ORDER BY timestamp DESC, id DESC LIMIT 1')
      .get(event) as { json: string } | undefined;
    return row ? (JSON.parse(row.json) as T) : null;
  }
}
