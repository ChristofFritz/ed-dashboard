import type { JournalEvent } from '@ed/shared';
import type { StateStore } from '../state/store.js';
import type { EdsmClient } from './client.js';

/** Fetch EDSM data for a system and write it into the exploration slice. */
export async function runEdsmLookup(
  store: StateStore,
  edsm: EdsmClient,
  systemName: string,
  systemAddress: number,
): Promise<void> {
  store.update('exploration', {
    edsm: { status: 'loading', knownBodyCount: null, interesting: [] },
  });
  const info = await edsm.systemBodies(systemName, systemAddress);
  // System may have changed while we were fetching.
  if (store.getState().exploration.systemAddress !== systemAddress) return;
  store.update('exploration', {
    edsm: info
      ? {
          status: 'ok',
          knownBodyCount: info.known ? info.bodyCount : 0,
          interesting: info.interesting,
        }
      : { status: 'offline', knownBodyCount: null, interesting: [] },
  });
}

/** Kick off an EDSM lookup whenever we arrive in a new system. */
export function wireEdsm(store: StateStore, edsm: EdsmClient): void {
  store.subscribe({
    onSlices() {},
    onEvent(event: JournalEvent) {
      if (event.event === 'FSDJump' || event.event === 'Location') {
        void runEdsmLookup(store, edsm, event.StarSystem, event.SystemAddress);
      }
    },
  });
}
