import crypto from 'node:crypto';
import type { IngestTokenCreated, IngestTokenInfo } from '@ed/shared';
import type { Db } from '../db/pg.js';

interface TokenRow {
  id: number;
  user_id: number;
  label: string;
  suffix: string;
  created_at: Date;
  last_used_at: Date | null;
}

function sha256(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}

function toInfo(row: TokenRow): IngestTokenInfo {
  return {
    id: row.id,
    label: row.label,
    suffix: row.suffix,
    createdAt: row.created_at.toISOString(),
    lastUsedAt: row.last_used_at?.toISOString() ?? null,
  };
}

/** Ingest tokens are high-entropy secrets used by the client app; we store
 *  only their SHA-256 so a DB leak can't be replayed. */
export class IngestTokenRepo {
  constructor(private readonly db: Db) {}

  async create(userId: number, label: string): Promise<IngestTokenCreated> {
    const secret = 'edci_' + crypto.randomBytes(24).toString('base64url');
    const r = await this.db.query<TokenRow>(
      `INSERT INTO ingest_tokens (user_id, label, token_hash, suffix) VALUES ($1, $2, $3, $4) RETURNING *`,
      [userId, label, sha256(secret), secret.slice(-4)],
    );
    return { ...toInfo(r.rows[0]!), token: secret };
  }

  async list(userId: number): Promise<IngestTokenInfo[]> {
    const r = await this.db.query<TokenRow>(
      `SELECT * FROM ingest_tokens WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId],
    );
    return r.rows.map(toInfo);
  }

  async revoke(userId: number, id: number): Promise<void> {
    await this.db.query(`DELETE FROM ingest_tokens WHERE user_id = $1 AND id = $2`, [userId, id]);
  }

  /** Resolve a presented token to its owning user id, or null. Bumps last_used_at. */
  async resolve(token: string): Promise<number | null> {
    const r = await this.db.query<{ id: number; user_id: number }>(
      `UPDATE ingest_tokens SET last_used_at = now() WHERE token_hash = $1 RETURNING id, user_id`,
      [sha256(token)],
    );
    return r.rows[0]?.user_id ?? null;
  }
}
