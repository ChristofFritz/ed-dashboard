import type { JournalEvent } from '@ed/shared';
import type { Db } from './pg.js';

export interface IngestRow {
  lineNo: number;
  raw: string;
  event: JournalEvent;
}

/**
 * Postgres-backed, per-user event store. The client app streams raw journal
 * lines in over /api/ingest; every method is scoped to a userId. Events are
 * de-duplicated on (file_id, line_no) so re-sends are harmless.
 */
export class EventStore {
  constructor(private readonly db: Db) {}

  private async getOrCreateFileId(userId: number, filename: string): Promise<number> {
    const ins = await this.db.query<{ id: number }>(
      `INSERT INTO journal_files (user_id, filename) VALUES ($1, $2)
       ON CONFLICT (user_id, filename) DO UPDATE SET filename = excluded.filename
       RETURNING id`,
      [userId, filename],
    );
    return ins.rows[0]!.id;
  }

  /** Insert a batch of events for one file. Returns the line numbers that were
   *  newly stored (duplicates from a re-send are skipped), so the caller can
   *  dispatch only genuinely-new events into the live state. */
  async writeBatch(userId: number, filename: string, rows: IngestRow[]): Promise<Set<number>> {
    if (rows.length === 0) return new Set();
    const fileId = await this.getOrCreateFileId(userId, filename);

    const values: string[] = [];
    const params: unknown[] = [];
    let p = 1;
    let maxLine = 0;
    for (const { lineNo, raw, event } of rows) {
      values.push(`($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++})`);
      params.push(userId, fileId, lineNo, event.timestamp, event.event, raw);
      if (lineNo > maxLine) maxLine = lineNo;
    }
    const res = await this.db.query<{ line_no: number }>(
      `INSERT INTO events (user_id, file_id, line_no, timestamp, event, json)
       VALUES ${values.join(', ')}
       ON CONFLICT (file_id, line_no) DO NOTHING
       RETURNING line_no`,
      params,
    );
    await this.db.query(
      `UPDATE journal_files SET line_count = GREATEST(line_count, $1) WHERE id = $2`,
      [maxLine, fileId],
    );
    return new Set(res.rows.map((r) => r.line_no));
  }

  /** Mark all-but-newest files completed (one journal grows per session). */
  async markOlderCompleted(userId: number): Promise<void> {
    await this.db.query(
      `UPDATE journal_files SET completed = true
       WHERE user_id = $1 AND filename <> (
         SELECT filename FROM journal_files WHERE user_id = $1 ORDER BY filename DESC LIMIT 1
       )`,
      [userId],
    );
  }

  /** Newest journal filename for a user (lexical == chronological), or null. */
  async newestFilename(userId: number): Promise<string | null> {
    const r = await this.db.query<{ filename: string }>(
      `SELECT filename FROM journal_files WHERE user_id = $1 ORDER BY filename DESC LIMIT 1`,
      [userId],
    );
    return r.rows[0]?.filename ?? null;
  }

  async eventCount(userId: number): Promise<number> {
    const r = await this.db.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM events WHERE user_id = $1`,
      [userId],
    );
    return r.rows[0]!.n;
  }

  /** All events of one file in line order (for hydration replay). */
  async eventsForFile(userId: number, filename: string): Promise<string[]> {
    const r = await this.db.query<{ json: string }>(
      `SELECT e.json FROM events e
       JOIN journal_files f ON f.id = e.file_id
       WHERE f.user_id = $1 AND f.filename = $2 ORDER BY e.line_no`,
      [userId, filename],
    );
    return r.rows.map((x) => x.json);
  }

  /** All events of a given type for a user, oldest first. */
  async eventsOfType(userId: number, event: string): Promise<string[]> {
    const r = await this.db.query<{ json: string }>(
      `SELECT json FROM events WHERE user_id = $1 AND event = $2 ORDER BY timestamp, id`,
      [userId, event],
    );
    return r.rows.map((x) => x.json);
  }

  /** Latest event of a given type for a user (by timestamp). */
  async latestEvent<T = unknown>(userId: number, event: string): Promise<T | null> {
    const r = await this.db.query<{ json: string }>(
      `SELECT json FROM events WHERE user_id = $1 AND event = $2
       ORDER BY timestamp DESC, id DESC LIMIT 1`,
      [userId, event],
    );
    return r.rows[0] ? (JSON.parse(r.rows[0].json) as T) : null;
  }

  async getMeta(userId: number, key: string): Promise<string | null> {
    const r = await this.db.query<{ value: string | null }>(
      `SELECT value FROM meta WHERE user_id = $1 AND key = $2`,
      [userId, key],
    );
    return r.rows[0]?.value ?? null;
  }

  async setMeta(userId: number, key: string, value: string): Promise<void> {
    await this.db.query(
      `INSERT INTO meta (user_id, key, value) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, key) DO UPDATE SET value = excluded.value`,
      [userId, key, value],
    );
  }
}
