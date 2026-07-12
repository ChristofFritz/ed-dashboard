import type { Db } from '../db/pg.js';
import type { TokenResponse } from './oauth.js';

/** Refresh a bit early to avoid using an access token that expires mid-request. */
const EXPIRY_SKEW_MS = 60_000;

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms when the access token expires. */
  expiresAt: number;
}

/** Persist per-user cAPI tokens in Postgres so they survive restarts. */
export class TokenStore {
  constructor(
    private readonly db: Db,
    private readonly userId: number,
  ) {}

  async load(): Promise<StoredTokens | null> {
    const row = (
      await this.db.query<{
        access_token: string;
        refresh_token: string;
        obtained_at: number;
        expires_in: number;
      }>('SELECT access_token, refresh_token, obtained_at, expires_in FROM capi_tokens WHERE user_id = $1', [
        this.userId,
      ])
    ).rows[0];
    if (!row) return null;
    return {
      accessToken: row.access_token,
      refreshToken: row.refresh_token,
      expiresAt: row.obtained_at + row.expires_in * 1000,
    };
  }

  async save(t: TokenResponse, now: number): Promise<StoredTokens> {
    await this.db.query(
      `INSERT INTO capi_tokens (user_id, access_token, refresh_token, obtained_at, expires_in)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id) DO UPDATE SET
         access_token = excluded.access_token,
         refresh_token = excluded.refresh_token,
         obtained_at = excluded.obtained_at,
         expires_in = excluded.expires_in`,
      [this.userId, t.access_token, t.refresh_token, now, t.expires_in],
    );
    return {
      accessToken: t.access_token,
      refreshToken: t.refresh_token,
      expiresAt: now + t.expires_in * 1000,
    };
  }

  async clear(): Promise<void> {
    await this.db.query('DELETE FROM capi_tokens WHERE user_id = $1', [this.userId]);
  }

  static isExpired(t: StoredTokens, now: number): boolean {
    return now >= t.expiresAt - EXPIRY_SKEW_MS;
  }
}
