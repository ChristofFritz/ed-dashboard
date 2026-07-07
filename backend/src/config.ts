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
  // Frontier Companion API (fleet carrier cargo). client_id is public (OAuth
  // public client + PKCE, no secret). Redirect URI must match what's registered
  // with Frontier for this client_id.
  capi: {
    clientId: process.env.ED_CAPI_CLIENT_ID ?? 'f27b2c7a-4f8d-4c25-855d-1ed3adeb2a6c',
    redirectUri: process.env.ED_CAPI_REDIRECT_URI ?? 'https://localhost:4200/edauthredirect',
    authBase: process.env.ED_CAPI_AUTH_BASE ?? 'https://auth.frontierstore.net',
    apiBase: process.env.ED_CAPI_API_BASE ?? 'https://companion.orerve.net',
    pollIntervalMs: Number(process.env.ED_CAPI_POLL_MS ?? 600_000),
  },
};
