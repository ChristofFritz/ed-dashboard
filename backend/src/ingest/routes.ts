import { Router } from 'express';
import { parseJournalLine } from '@ed/shared';
import type { IngestPayload } from '@ed/shared';
import type { EventStore, IngestRow } from '../db/event-store.js';
import type { SessionManager } from '../users/session-manager.js';
import type { IngestTokenRepo } from '../auth/ingest-tokens.js';
import { requireIngestToken } from '../auth/middleware.js';
import { applySidecar } from '../sidecar/apply.js';

/**
 * Client-app ingest. Authenticated by an ingest token (Bearer). Raw journal
 * lines are parsed, de-duplicated into Postgres, and only genuinely-new events
 * are dispatched into the user's live state (so re-sends don't double-count).
 */
export function ingestRouter(
  sessions: SessionManager,
  events: EventStore,
  tokens: IngestTokenRepo,
): Router {
  const r = Router();

  r.post('/ingest', requireIngestToken(tokens), async (req, res) => {
    const userId = req.userId!;
    const payload = (req.body ?? {}) as IngestPayload;
    const session = await sessions.get(userId);
    let accepted = 0;

    for (const batch of payload.batches ?? []) {
      const rows: IngestRow[] = [];
      for (const { lineNo, raw } of batch.events) {
        const event = parseJournalLine(raw);
        if (event) rows.push({ lineNo, raw, event });
      }
      if (rows.length === 0) continue;

      const stored = await events.writeBatch(userId, batch.filename, rows);
      accepted += stored.size;
      // Dispatch only newly-stored events, in line order.
      for (const row of rows.sort((a, b) => a.lineNo - b.lineNo)) {
        if (stored.has(row.lineNo)) session.state.dispatch(row.event);
      }
    }
    if ((payload.batches?.length ?? 0) > 0) await events.markOlderCompleted(userId);

    for (const sc of payload.sidecars ?? []) {
      try {
        applySidecar(session.state, sc.file, sc.data);
      } catch (err) {
        console.error('sidecar apply failed:', err instanceof Error ? err.message : err);
      }
    }

    res.json({ ok: true, accepted });
  });

  return r;
}
