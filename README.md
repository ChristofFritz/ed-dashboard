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
- `client/` — a standalone **Go desktop app** (Fyne GUI, no runtime to install)
  that runs on the gaming PC. A window shows the config (server URL, token,
  journal dir), a Start/Stop control, a status indicator, and a live log. Under
  the hood it polls the journal folder + sidecar files (Status/Cargo/NavRoute/
  Market), tracks byte offsets locally, and POSTs event batches to the server's
  `/api/ingest` authenticated with an ingest token. Re-sends are safe (server
  de-dupes). Config lives in `~/.ed-dashboard/config.toml` (also editable in the
  window). A `--headless` flag runs it without the GUI (console logging).
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

### Behind a reverse proxy (hosted, HTTPS)

The whole app is single-origin — the dashboard, API, and the Soketi websocket
(`/soketi`) are all served by the backend — so a proxy only needs to forward one
host to it, and websocket upgrades work automatically. Bind the backend to
localhost so only the proxy reaches it, and point the proxy at it:

```bash
# .env
ED_BIND=127.0.0.1
ED_SECURE_COOKIES=true
ED_CAPI_REDIRECT_URI=https://your.domain/edauthredirect
```

Example Traefik file-provider route (TLS via your resolver):

```yaml
http:
  routers:
    ed-helper:
      rule: "Host(`your.domain`)"
      entryPoints: [websecure]
      service: ed-helper
      tls: { certResolver: le }
  services:
    ed-helper:
      loadBalancer:
        servers:
          - url: "http://127.0.0.1:3400"
```

nginx equivalent needs the usual `Upgrade`/`Connection` headers so `/soketi`
can upgrade to a websocket.

## Running the client (on the gaming PC)

Download for your OS/arch from the [Releases](../../releases) page and
double-click it:

- **Windows** — `ed-dashboard-client-windows-{x64,arm64}.exe`
- **macOS** — `ed-dashboard-client-macos-{x64,arm64}.zip` → unzip → move
  **ED Dashboard Client.app** to Applications. It's **unsigned**, so macOS
  quarantines it on download and refuses to open it ("damaged / can't be
  opened"). Clear the quarantine flag once, then open it:

  ```bash
  xattr -cr "/Applications/ED Dashboard Client.app"
  open "/Applications/ED Dashboard Client.app"
  ```

  (`xattr -cr` strips the `com.apple.quarantine` attribute recursively. You
  only need to do this once per download.)
- **Linux** — `ed-dashboard-client-linux-{x64,arm64}` (mark executable; needs a
  desktop with OpenGL)

A window opens with the config, a Start/Stop button, a status light, and a live
log. Paste your ingest token (from the dashboard **⚙ ACCOUNT**), pick the
journal folder (a ✓/⚠ hint shows whether it holds journal files, or use
**Browse…**), and hit **Start**. Settings are saved to
`~/.ed-dashboard/config.toml`. The default `journal_dir` is guessed per OS
(Windows Saved Games, macOS CrossOver bottle, Linux Proton prefix).

On launch the app checks GitHub for a newer release (failing silently if
offline); when one exists, a **download** link appears at the top. Updating is
manual — download the new build and replace the old one — because auto-replacing
an unsigned macOS `.app` fights Gatekeeper and isn't worth the risk.

## Local development (without Docker)

Needs a Postgres and a Soketi running locally.

```bash
nvm use
npm install
DATABASE_URL=postgres://ed:ed@localhost:5432/ed npm run dev   # server :3400 + Angular :4200
cd client && go run .                                         # the client
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

**Client** — `~/.ed-dashboard/config.toml` (auto-created on first run)

| Key                | Default                                |
| ------------------ | -------------------------------------- |
| `server_url`       | `http://localhost:3400`                |
| `ingest_token`     | *(required — from the dashboard)*      |
| `journal_dir`      | OS-specific journal path (guessed)     |
| `poll_interval_ms` | `1000`                                 |

Byte offsets are persisted alongside it in `~/.ed-dashboard/offsets.json`.

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
