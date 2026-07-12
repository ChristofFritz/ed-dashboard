import { parseJournalLine } from '@ed/shared';
import type { Db } from '../db/pg.js';
import type { EventStore } from '../db/event-store.js';
import { StateStore } from '../state/store.js';
import { registerReducers } from '../state/register.js';
import { seedColonisation } from '../state/colonisation.seed.js';
import { EdsmClient } from '../edsm/client.js';
import { wireEdsm, runEdsmLookup } from '../edsm/wire.js';
import { CapiService } from '../capi/service.js';
import type { Publisher } from '../pusher/publisher.js';

/**
 * One live in-memory dashboard state for a single user. Built lazily on first
 * access and hydrated from Postgres, so it survives server restarts. Publishes
 * every slice/event change to the user's Soketi channel.
 */
export class UserSession {
  readonly state = new StateStore();
  readonly edsm: EdsmClient;
  readonly capi: CapiService;
  lastActive = Date.now();
  private unsub: (() => void) | null = null;

  constructor(
    readonly userId: number,
    db: Db,
    private readonly events: EventStore,
    private readonly publisher: Publisher,
  ) {
    registerReducers(this.state);
    this.edsm = new EdsmClient(db);
    this.capi = new CapiService(db, userId, this.state);
    wireEdsm(this.state, this.edsm);
  }

  /** Replay persisted history, then start publishing live changes. */
  async init(): Promise<void> {
    await seedColonisation(this.events, this.userId, this.state);

    const newest = await this.events.newestFilename(this.userId);
    if (newest) {
      let lastEventName: string | null = null;
      for (const json of await this.events.eventsForFile(this.userId, newest)) {
        const event = parseJournalLine(json);
        if (event) {
          this.state.dispatch(event, { silent: true });
          lastEventName = event.event;
        }
      }
      if (lastEventName === 'Shutdown') this.state.update('commander', { statusStale: true });
    }

    // Attach the publisher only now, so hydration replay is silent.
    this.unsub = this.state.subscribe({
      onSlices: (dirty, state) => {
        for (const slice of dirty) this.publisher.publish(this.userId, { type: 'slice', slice, data: state[slice] });
      },
      onEvent: (event) => this.publisher.publish(this.userId, { type: 'event', data: event }),
    });

    // Hydration was silent; refresh EDSM for the current system explicitly.
    const { systemName, systemAddress } = this.state.getState().exploration;
    if (systemName && systemAddress) void runEdsmLookup(this.state, this.edsm, systemName, systemAddress);

    await this.capi.start();
  }

  touch(): void {
    this.lastActive = Date.now();
  }

  dispose(): void {
    this.unsub?.();
    this.unsub = null;
    this.capi.stop();
  }
}
