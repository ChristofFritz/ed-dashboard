/** Server (hosted) configuration. The server no longer reads journal files;
 *  the client app does that and streams events in over /api/ingest. */

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`missing required env var ${name}`);
  return v;
}

export const config = {
  port: Number(process.env.ED_PORT ?? 3400),
  host: process.env.ED_HOST ?? '0.0.0.0',

  // Postgres connection.
  databaseUrl: required('DATABASE_URL', 'postgres://ed:ed@localhost:5432/ed'),

  // Auth: JWT signing secret for the dashboard session cookie.
  jwtSecret: required('ED_JWT_SECRET', 'dev-insecure-change-me'),
  // Cookie sent over https only in production.
  secureCookies: process.env.ED_SECURE_COOKIES === 'true',
  // Session lifetime.
  sessionTtlDays: Number(process.env.ED_SESSION_TTL_DAYS ?? 30),

  // How long an idle per-user state store lingers in memory before eviction.
  userIdleEvictMs: Number(process.env.ED_USER_IDLE_EVICT_MS ?? 30 * 60_000),

  // Soketi (Pusher-compatible). Server triggers events; the dashboard subscribes.
  pusher: {
    appId: required('SOKETI_APP_ID', 'ed-app'),
    key: required('SOKETI_APP_KEY', 'ed-key'),
    secret: required('SOKETI_APP_SECRET', 'ed-secret'),
    // Server -> Soketi HTTP API host/port (internal, docker network).
    host: process.env.SOKETI_HOST ?? 'localhost',
    port: Number(process.env.SOKETI_PORT ?? 6001),
    useTLS: process.env.SOKETI_USE_TLS === 'true',
    cluster: process.env.SOKETI_CLUSTER ?? 'mt1',
    // Same-origin path the browser's Soketi websocket is proxied under. The
    // server upgrades this path to Soketi, so the dashboard never needs a
    // separate Soketi host/port and inherits the page's http/https scheme.
    wsPath: process.env.SOKETI_WS_PATH ?? '/soketi',
  },

  // Frontier Companion API (fleet carrier cargo), per-user OAuth. client_id is
  // public (PKCE, no secret). Redirect URI must match Frontier's registration.
  capi: {
    clientId: process.env.ED_CAPI_CLIENT_ID ?? 'f27b2c7a-4f8d-4c25-855d-1ed3adeb2a6c',
    redirectUri: process.env.ED_CAPI_REDIRECT_URI ?? 'https://localhost:4200/edauthredirect',
    authBase: process.env.ED_CAPI_AUTH_BASE ?? 'https://auth.frontierstore.net',
    apiBase: process.env.ED_CAPI_API_BASE ?? 'https://companion.orerve.net',
    pollIntervalMs: Number(process.env.ED_CAPI_POLL_MS ?? 600_000),
  },
};
