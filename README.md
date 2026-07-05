# ED Helper

Live dashboard for Elite Dangerous, fed by the game's journal files. Replaces
Exploration Buddy and adds target, mining, and session panels. Runs alongside
EDMC (both only read the journals).

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
  session earnings breakdown (bounties/exploration/exobiology/trade/missions).

The layout is **activity-aware**: whatever you're doing (mining, combat,
exploring) gets the big panel automatically. Click a panel header to pin it;
click again to unpin.

## Architecture

npm-workspaces monorepo, TypeScript everywhere (Node 26, see `.nvmrc`):

- `shared/` — journal event types, state slice types, WS protocol.
- `backend/` — tails journal files (polling, Wine-safe), persists every event
  to SQLite (`data/ed-helper.db`, crash-safe offsets, historical backfill on
  first run), reduces events into state slices, pushes them over WebSocket.
  Express + ws on port **3400**, bound to 0.0.0.0 (open the dashboard from a
  tablet via `http://<mac-ip>:3400`).
- `frontend/` — Angular 21 (zoneless, signals), reconnecting WebSocket service,
  four panels, ED-cockpit theme.

## Usage

```bash
nvm use            # Node 26
npm install
npm run dev        # backend :3400 + Angular dev server :4200 (proxied)
```

Production (single server on :3400):

```bash
npm run build
npm start
```

Tests (valuation formulas, exploration reducer):

```bash
npm test
```

## Configuration (env vars)

| Variable              | Default                                  |
| --------------------- | ---------------------------------------- |
| `ED_JOURNAL_DIR`      | CrossOver bottle journal path (config.ts) |
| `ED_PORT`             | `3400`                                   |
| `ED_HOST`             | `0.0.0.0`                                |
| `ED_DB_PATH`          | `data/ed-helper.db`                      |
| `ED_USE_POLLING`      | `true` (Wine writes need polling)        |
| `ED_POLL_INTERVAL_MS` | `1000`                                   |

## Notes

- Session = `LoadGame` → `Shutdown`; relogging resets session stats. The
  backend can restart mid-session without losing state (it replays the active
  journal on boot).
- EDSM lookups are cached in SQLite for 24h and degrade gracefully offline.
- All timestamps are stored as UTC (journal format) and localized in the UI.
