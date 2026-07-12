# ED Dashboard

Hosted, multi-user live dashboard for Elite Dangerous. A small **client app**
runs on the PC where the game is installed, tails the journal + sidecar files,
and streams events to a **hosted server**. The server persists everything to
Postgres, reduces events into state slices per user, and pushes updates to the
browser dashboard over authenticated websockets (**Soketi** / Pusher protocol).

## Panels

- **Exploration** — FSS progress, scanned bodies with estimated scan/map values
  (community-standard formulas), terraformable/first-discovery flags, bio/geo
  signals with genuses, exobiology sample tracker (1/3 → 3/3), EDSM
  known-bodies check, Spansh deep-link on the system name.
- **Target** — targeted ship with scan-stage-aware details (pilot, faction,
  legal status, bounty, shield/hull), bounty ledger, session kill/bounty totals.
- **Mining** — last prospector result (materials, content, core), refined tons
  per commodity, cargo from Cargo.json, limpets launched.
- **Session** — commander, credits, ship, location, nav route, fuel, pips,
  session earnings breakdown.

The layout is **activity-aware**: whatever you're doing gets the big panel
automatically.

## Architecture

npm-workspaces monorepo, TypeScript everywhere (Node 26, see `.nvmrc`):

- `shared/` — journal event types, state slice types, WS + API DTOs, journal
  line parser.
- `client/` — runs on the gaming PC. Tails journal files (polling, Wine-safe)
  and sidecar files (Status/Cargo/NavRoute/Market), tracks byte offsets locally,
  and POSTs event batches to the server's `/api/ingest` authenticated with an
  ingest token. Re-sends are safe (server de-dupes).
- `backend/` — hosted server on port **3400**. Postgres for storage, email +
  password auth (JWT session cookie), per-user in-memory state stores hydrated
  from history on demand. Receives events over `/api/ingest`, reduces them, and
  publishes slice/event updates to each user's **private Soketi channel**.
  Serves the built dashboard and authorises channel subscriptions
  (`/api/pusher/auth`). Per-user Frontier cAPI (fleet carrier) link.
- `frontend/` — Angular 21 (zoneless, signals). Login/register, account +
  client-setup page (create ingest tokens), and the dashboard which fetches a
  state snapshot then subscribes to its private Soketi channel via `pusher-js`.

Data flow:

```
game journal ──▶ client ──POST /api/ingest──▶ server ──▶ Postgres
                                                 │
                                                 └─▶ Soketi ──▶ dashboard (pusher-js)
```

## Running (Docker Compose)

Brings up Postgres, Soketi, and the server (which also serves the dashboard):

```bash
cp .env.example .env      # then edit secrets
docker compose up --build
```

Open http://localhost:3400, register an account, open **⚙ ACCOUNT**, and create
a client token.

## Running the client (on the gaming PC)

```bash
npm install
ED_SERVER_URL=https://your-host \
ED_INGEST_TOKEN=<token from the dashboard> \
npm run start -w client
```

`ED_JOURNAL_DIR` defaults to the macOS CrossOver bottle path; override it for
your OS (e.g. `%USERPROFILE%\Saved Games\Frontier Developments\Elite Dangerous`
on Windows).

## Local development (without Docker)

Needs a Postgres and a Soketi running locally.

```bash
nvm use
npm install
DATABASE_URL=postgres://ed:ed@localhost:5432/ed npm run dev   # server :3400 + Angular :4200
npm run dev:client                                            # the client
```

Tests (valuation formulas, reducers, cAPI client):

```bash
npm test
```

## Configuration (env vars)

**Server**

| Variable             | Default                              |
| -------------------- | ------------------------------------ |
| `DATABASE_URL`       | `postgres://ed:ed@localhost:5432/ed` |
| `ED_JWT_SECRET`      | dev placeholder — **change it**      |
| `ED_SECURE_COOKIES`  | `false` (set `true` behind HTTPS)    |
| `ED_PORT` / `ED_HOST`| `3400` / `0.0.0.0`                   |
| `SOKETI_APP_ID/KEY/SECRET` | `ed-app` / `ed-key` / `ed-secret` |
| `SOKETI_HOST` / `SOKETI_PORT` | `localhost` / `6001` (server→Soketi) |
| `SOKETI_PUBLIC_HOST/PORT/TLS` | browser→Soketi target       |

**Client**

| Variable              | Default                                   |
| --------------------- | ----------------------------------------- |
| `ED_SERVER_URL`       | `http://localhost:3400`                   |
| `ED_INGEST_TOKEN`     | *(required)*                              |
| `ED_JOURNAL_DIR`      | CrossOver bottle journal path (config.ts) |
| `ED_CLIENT_STATE_DIR` | `~/.ed-client` (byte-offset persistence)  |
| `ED_USE_POLLING`      | `true` (Wine writes need polling)         |
| `ED_POLL_INTERVAL_MS` | `1000`                                    |

## Notes

- Websocket delivery is authenticated: the dashboard may only subscribe to its
  own `private-user-<id>` channel, signed by the server after checking the
  session cookie.
- Session = `LoadGame` → `Shutdown`; relogging resets session stats. The server
  rebuilds state by replaying the newest journal on demand, so it can restart
  without losing the session.
- EDSM lookups are cached in Postgres for 24h and degrade gracefully offline.
- All timestamps are stored as UTC (journal format) and localized in the UI.

## License

[GNU General Public License v3.0 or later](LICENSE) © Christof Fritz.
```
