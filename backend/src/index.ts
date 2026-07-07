import { config } from './config.js';
import { openDatabase } from './db/database.js';
import { EventStore } from './db/event-store.js';
import { JournalTailer } from './journal/tailer.js';
import { JournalIngest } from './journal/ingest.js';
import { backfill } from './journal/backfill.js';
import { watchJournalDir } from './journal/watcher.js';
import { watchSidecars } from './sidecar/watcher.js';
import { applySidecar } from './sidecar/apply.js';
import { StateStore } from './state/store.js';
import { registerReducers } from './state/register.js';
import { createHttpServer } from './server/http.js';
import { attachWebSocket } from './server/ws.js';
import { parseJournalLine } from './journal/parse.js';
import { EdsmClient } from './edsm/client.js';
import { wireEdsm, runEdsmLookup } from './edsm/wire.js';
import { CapiService } from './capi/service.js';

async function main() {
  console.log('ed-helper backend starting');
  console.log(`journal dir: ${config.journalDir}`);

  const db = openDatabase();
  const store = new EventStore(db);
  const state = new StateStore();
  registerReducers(state);

  // 1. Backfill: persist anything written while we were down.
  const t0 = performance.now();
  const tailer = new JournalTailer();
  const newest = await backfill(tailer, store);
  console.log(
    `backfill done in ${(performance.now() - t0).toFixed(0)}ms — ` +
      `${store.eventCount()} events in db, active file: ${newest ?? 'none'}`,
  );

  // 2. Hydrate live state by replaying the newest journal (starts at Fileheader,
  //    so session/system state reconstructs exactly).
  if (newest) {
    let lastEventName: string | null = null;
    for (const json of store.eventsForFile(newest)) {
      const event = parseJournalLine(json);
      if (event) {
        state.dispatch(event, { silent: true });
        lastEventName = event.event;
      }
    }
    if (lastEventName === 'Shutdown') state.update('commander', { statusStale: true });
  }

  // 3. Serve before flushing so the first WS snapshot already has hydrated state.
  const edsm = new EdsmClient(db);
  wireEdsm(state, edsm);
  // Hydration replays silently, so fire the lookup for the current system manually.
  const { systemName, systemAddress } = state.getState().exploration;
  if (systemName && systemAddress) {
    void runEdsmLookup(state, edsm, systemName, systemAddress);
  }

  // Fleet carrier via Frontier cAPI (linked separately via OAuth).
  const capi = new CapiService(db, state);

  const server = createHttpServer(state, capi);
  attachWebSocket(server, state);
  server.listen(config.port, config.host, () => {
    console.log(`listening on http://${config.host}:${config.port}`);
  });
  state.flush();
  capi.start();

  // 4. Live tail.
  const ingest = new JournalIngest(tailer, (batch) => {
    store.writeBatch(batch);
    for (const { event } of batch.events) state.dispatch(event);
  });
  watchJournalDir((filePath) => ingest.fileChanged(filePath));
  let lastStatusAt = 0;
  watchSidecars((file, data) => {
    if (file === 'Status.json') lastStatusAt = Date.now();
    applySidecar(state, file, data);
  });

  // Fall back to the overview when no activity-relevant event arrived for a while.
  let lastActivityChange = Date.now();
  state.subscribe({
    onEvent(event) {
      // Status.json goes quiet when idle/docked, so only the game actually
      // exiting (or a long silence, below) counts as stale.
      if (event.event === 'Shutdown') state.update('commander', { statusStale: true });
      else if (event.event === 'LoadGame') state.update('commander', { statusStale: false });
    },
    onSlices(dirty) {
      if (dirty.includes('session')) lastActivityChange = Date.now();
    },
  });
  setInterval(() => {
    const session = state.getState().session;
    if (session.activity !== 'overview' && Date.now() - lastActivityChange > 180_000) {
      state.update('session', { activity: 'overview' });
    }
  }, 15_000).unref();

  // Fallback for crashes that never write a Shutdown event: a very long
  // Status.json silence. Idle-but-running never gets near this.
  setInterval(() => {
    if (Date.now() - lastStatusAt > 600_000 && !state.getState().commander.statusStale) {
      state.update('commander', { statusStale: true });
    }
  }, 30_000).unref();
}

main().catch((err) => {
  console.error('fatal:', err);
  process.exit(1);
});
