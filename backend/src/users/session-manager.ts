import { config } from '../config.js';
import type { Db } from '../db/pg.js';
import type { EventStore } from '../db/event-store.js';
import type { Publisher } from '../pusher/publisher.js';
import { UserSession } from './user-session.js';

/**
 * Owns the lifecycle of per-user state stores: lazy creation + hydration,
 * de-duplicated concurrent init, and idle eviction back to Postgres.
 */
export class SessionManager {
  private sessions = new Map<number, UserSession>();
  private pending = new Map<number, Promise<UserSession>>();

  constructor(
    private readonly db: Db,
    private readonly events: EventStore,
    private readonly publisher: Publisher,
  ) {
    setInterval(() => this.evictIdle(), 60_000).unref();
  }

  async get(userId: number): Promise<UserSession> {
    const existing = this.sessions.get(userId);
    if (existing) {
      existing.touch();
      return existing;
    }
    const inflight = this.pending.get(userId);
    if (inflight) return inflight;

    const promise = (async () => {
      const session = new UserSession(userId, this.db, this.events, this.publisher);
      await session.init();
      this.sessions.set(userId, session);
      this.pending.delete(userId);
      return session;
    })();
    this.pending.set(userId, promise);
    return promise;
  }

  private evictIdle(): void {
    const cutoff = Date.now() - config.userIdleEvictMs;
    for (const [userId, session] of this.sessions) {
      if (session.lastActive < cutoff) {
        session.dispose();
        this.sessions.delete(userId);
      }
    }
  }
}
