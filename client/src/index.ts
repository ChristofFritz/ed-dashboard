import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';
import { OffsetStore } from './offset-store.js';
import { JournalTailer } from './tailer.js';
import { IngestClient } from './ingest-client.js';
import { isJournalFile, watchJournalDir } from './watcher.js';
import { watchSidecars } from './sidecar-watcher.js';

async function main() {
  console.log('ed-dashboard client starting');
  console.log(`server:  ${config.serverUrl}`);
  console.log(`journal: ${config.journalDir}`);

  const offsets = new OffsetStore(config.stateDir);
  await offsets.load();
  const tailer = new JournalTailer();
  const ingest = new IngestClient();

  // Cap events per request so a large first-run backfill stays well under the
  // server's body-size limit.
  const CHUNK = 2000;

  // Poll one file, forward any new lines, then persist its offset. Persisting
  // only after a successful send means a crash re-reads (server de-dupes).
  const pump = async (filePath: string): Promise<number> => {
    const batch = await tailer.poll(filePath);
    if (!batch) return 0;
    let accepted = 0;
    for (let i = 0; i < batch.events.length; i += CHUNK) {
      accepted += await ingest.send({
        batches: [{ filename: batch.filename, events: batch.events.slice(i, i + CHUNK) }],
      });
    }
    offsets.set(batch.filename, batch.newOffset, batch.newLineNo);
    return accepted;
  };

  // 1. Backfill: seed cursors from persisted offsets and forward anything
  //    written while we were down, oldest file first.
  const names = (await readdir(config.journalDir)).filter(isJournalFile).sort();
  let backfilled = 0;
  for (const filename of names) {
    const saved = offsets.get(filename);
    if (saved) tailer.seed(filename, saved.offset, saved.lineNo);
    backfilled += await pump(path.join(config.journalDir, filename));
  }
  await offsets.flush();
  console.log(`backfill done — forwarded ${backfilled} new events across ${names.length} files`);

  // 2. Live tail: serialize polls so batches are sent strictly in arrival order.
  let queue: Promise<void> = Promise.resolve();
  watchJournalDir((filePath) => {
    queue = queue
      .then(async () => {
        const n = await pump(filePath);
        if (n > 0) console.log(`forwarded ${n} events from ${path.basename(filePath)}`);
      })
      .catch((err) => console.error(`ingest error for ${filePath}:`, err));
  });

  // 3. Sidecar files (Status/Cargo/NavRoute/Market) — best-effort, fire-and-forget.
  watchSidecars((file, data) => {
    void ingest.send({ sidecars: [{ file, data }] }).catch((err) => console.error('sidecar send:', err));
  });

  console.log('watching for changes…');
}

main().catch((err) => {
  console.error('fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
