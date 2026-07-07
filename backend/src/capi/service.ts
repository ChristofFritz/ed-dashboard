import type Database from 'better-sqlite3';
import { config } from '../config.js';
import type { StateStore } from '../state/store.js';
import { buildAuthUrl, createPkce, exchangeCode, randomState, refreshTokens } from './oauth.js';
import { TokenStore, type StoredTokens } from './tokens.js';
import { AuthError, fetchFleetCarrier, NO_CARRIER } from './client.js';

/**
 * Owns the Frontier cAPI link: OAuth login/callback, token refresh, and a
 * periodic poll of /fleetcarrier into the `carrier` state slice.
 */
export class CapiService {
  private readonly tokens: TokenStore;
  /** Pending PKCE verifiers keyed by OAuth `state`, awaiting the callback. */
  private readonly pending = new Map<string, string>();
  private timer: NodeJS.Timeout | null = null;

  constructor(db: Database.Database, private readonly store: StateStore) {
    this.tokens = new TokenStore(db);
  }

  /** Load any persisted tokens and start polling if linked. */
  start(): void {
    const linked = this.tokens.load() !== null;
    this.store.update('carrier', { auth: linked ? 'linked' : 'unlinked' });
    this.timer = setInterval(() => void this.poll(), config.capi.pollIntervalMs);
    this.timer.unref();
    if (linked) void this.poll();
  }

  /** Build the Frontier authorize URL and remember the PKCE verifier for the callback. */
  loginUrl(): string {
    const state = randomState();
    const { verifier, challenge } = createPkce();
    this.pending.set(state, verifier);
    return buildAuthUrl(state, challenge);
  }

  /** Handle the OAuth redirect: exchange the code, persist tokens, poll immediately. */
  async handleCallback(code: string, state: string): Promise<void> {
    const verifier = this.pending.get(state);
    if (!verifier) throw new Error('unknown or expired OAuth state');
    this.pending.delete(state);
    const res = await exchangeCode(code, verifier);
    this.tokens.save(res, Date.now());
    this.store.update('carrier', { auth: 'linked', lastError: null });
    await this.poll();
  }

  /** Fetch the carrier now (used by the manual refresh button and the timer). */
  async poll(): Promise<void> {
    let stored = this.tokens.load();
    if (!stored) {
      this.store.update('carrier', { auth: 'unlinked' });
      return;
    }
    try {
      const access = await this.validAccessToken(stored);
      const data = await this.fetchWithRetry(access, stored);
      if (data === NO_CARRIER) {
        this.store.update('carrier', {
          auth: 'linked',
          cargo: [],
          totalTons: 0,
          lastError: 'No fleet carrier owned.',
          updatedAt: new Date().toISOString(),
        });
        return;
      }
      this.store.update('carrier', {
        auth: 'linked',
        callsign: data.callsign,
        name: data.name,
        cargo: data.cargo,
        totalTons: data.totalTons,
        updatedAt: new Date().toISOString(),
        lastError: null,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('cAPI poll failed:', msg);
      if (err instanceof AuthError) {
        this.tokens.clear();
        this.store.update('carrier', { auth: 'error', lastError: 'Link expired — reconnect.' });
      } else {
        this.store.update('carrier', { lastError: msg });
      }
    }
  }

  /** Return a non-expired access token, refreshing if needed. */
  private async validAccessToken(stored: StoredTokens): Promise<string> {
    if (!TokenStore.isExpired(stored, Date.now())) return stored.accessToken;
    const res = await refreshTokens(stored.refreshToken);
    return this.tokens.save(res, Date.now()).accessToken;
  }

  /** Fetch once; on a rejected token force one refresh and retry. */
  private async fetchWithRetry(access: string, stored: StoredTokens) {
    try {
      return await fetchFleetCarrier(access);
    } catch (err) {
      if (!(err instanceof AuthError)) throw err;
      const res = await refreshTokens(stored.refreshToken).catch(() => {
        throw new AuthError('refresh failed');
      });
      const fresh = this.tokens.save(res, Date.now());
      return await fetchFleetCarrier(fresh.accessToken);
    }
  }
}
