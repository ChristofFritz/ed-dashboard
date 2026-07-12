import os from 'node:os';
import path from 'node:path';

const DEFAULT_JOURNAL_DIR = path.join(
  os.homedir(),
  'Library/Application Support/CrossOver/Bottles/Steam/drive_c/users/crossover/Saved Games/Frontier Developments/Elite Dangerous',
);

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing required env var ${name}`);
  return v;
}

export const config = {
  /** Base URL of the hosted server, e.g. https://ed.example.com */
  serverUrl: (process.env.ED_SERVER_URL ?? 'http://localhost:3400').replace(/\/$/, ''),
  /** Ingest token created in the dashboard (Authorization: Bearer …). */
  ingestToken: required('ED_INGEST_TOKEN'),
  journalDir: process.env.ED_JOURNAL_DIR ?? DEFAULT_JOURNAL_DIR,
  /** Where to persist per-file byte offsets between runs. */
  stateDir: process.env.ED_CLIENT_STATE_DIR ?? path.join(os.homedir(), '.ed-client'),
  // Wine writes may not emit fsevents reliably; polling is the safe default.
  usePolling: process.env.ED_USE_POLLING !== 'false',
  pollIntervalMs: Number(process.env.ED_POLL_INTERVAL_MS ?? 1000),
};
