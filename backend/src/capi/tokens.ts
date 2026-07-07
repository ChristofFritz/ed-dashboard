import type Database from 'better-sqlite3';
import type { TokenResponse } from './oauth.js';

const META_KEY = 'capi_tokens';
/** Refresh a bit early to avoid using an access token that expires mid-request. */
const EXPIRY_SKEW_MS = 60_000;

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms when the access token expires. */
  expiresAt: number;
}

/** Persist cAPI tokens in the meta table so they survive restarts / prod. */
export class TokenStore {
  constructor(private readonly db: Database.Database) {}

  load(): StoredTokens | null {
    const row = this.db.prepare('SELECT value FROM meta WHERE key = ?').get(META_KEY) as
      | { value: string }
      | undefined;
    if (!row) return null;
    try {
      return JSON.parse(row.value) as StoredTokens;
    } catch {
      return null;
    }
  }

  save(t: TokenResponse, now: number): StoredTokens {
    const stored: StoredTokens = {
      accessToken: t.access_token,
      refreshToken: t.refresh_token,
      expiresAt: now + t.expires_in * 1000,
    };
    this.db
      .prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(META_KEY, JSON.stringify(stored));
    return stored;
  }

  clear(): void {
    this.db.prepare('DELETE FROM meta WHERE key = ?').run(META_KEY);
  }

  static isExpired(t: StoredTokens, now: number): boolean {
    return now >= t.expiresAt - EXPIRY_SKEW_MS;
  }
}
