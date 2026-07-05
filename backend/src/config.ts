import os from 'node:os';
import path from 'node:path';

const DEFAULT_JOURNAL_DIR = path.join(
  os.homedir(),
  'Library/Application Support/CrossOver/Bottles/Steam/drive_c/users/crossover/Saved Games/Frontier Developments/Elite Dangerous',
);

export const config = {
  journalDir: process.env.ED_JOURNAL_DIR ?? DEFAULT_JOURNAL_DIR,
  port: Number(process.env.ED_PORT ?? 3400),
  host: process.env.ED_HOST ?? '0.0.0.0',
  dbPath: process.env.ED_DB_PATH ?? path.join(import.meta.dirname, '../../data/ed-helper.db'),
  // Wine writes may not emit fsevents reliably; polling is the safe default.
  usePolling: process.env.ED_USE_POLLING !== 'false',
  pollIntervalMs: Number(process.env.ED_POLL_INTERVAL_MS ?? 1000),
};
