import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { JournalTailer } from './tailer.js';
import { isJournalFile } from './watcher.js';
import { EventStore } from '../db/event-store.js';
import { config } from '../config.js';

/**
 * Seeds tailer cursors from persisted offsets and ingests any bytes written
 * while we were not running, oldest file first. Returns the newest journal
 * filename (the likely-active one) or null if none exist.
 */
export async function backfill(tailer: JournalTailer, store: EventStore): Promise<string | null> {
  const names = (await readdir(config.journalDir)).filter(isJournalFile).sort();

  for (const filename of names) {
    const row = store.getOrCreateFile(filename);
    tailer.seed(filename, row.byte_offset, row.line_count);
    const batch = await tailer.poll(path.join(config.journalDir, filename));
    if (batch) store.writeBatch(batch);
  }

  // Everything but the newest file can no longer grow (one journal per session).
  for (const filename of names.slice(0, -1)) store.markCompleted(filename);

  return names.at(-1) ?? null;
}
