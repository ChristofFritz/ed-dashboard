import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import type { StateStore } from '../state/store.js';
import type { CapiService } from '../capi/service.js';
import type { EventStore } from '../db/event-store.js';
import { fetchBestStops, fetchCommoditySources } from '../colonisation/sources.js';
import { dismissProject } from '../state/colonisation.dismiss.js';

export function createHttpServer(
  store: StateStore,
  capi: CapiService,
  events: EventStore,
): http.Server {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });
  app.get('/api/state', (_req, res) => {
    res.json(store.getState());
  });

  // ── Frontier cAPI (fleet carrier) ──────────────────────────────────────────
  // Start the OAuth dance: redirect the browser to Frontier's authorize page.
  app.get('/api/capi/login', (_req, res) => {
    res.redirect(capi.loginUrl());
  });
  // The redirect page (https://localhost:4200/edauthredirect) posts the code here.
  app.post('/api/capi/exchange', async (req, res) => {
    const { code, state } = req.body as { code?: string; state?: string };
    if (!code || !state) {
      res.status(400).json({ error: 'missing code/state' });
      return;
    }
    try {
      await capi.handleCallback(code, state);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'exchange failed' });
    }
  });
  // Manual refresh button.
  app.post('/api/capi/refresh', async (_req, res) => {
    await capi.poll();
    res.json({ ok: true });
  });

  // ── Colonisation sourcing (Spansh) ─────────────────────────────────────────
  // Nearest stations selling `commodity` (localised name), from `system`.
  app.get('/api/colonisation/sources', async (req, res) => {
    const commodity = String(req.query.commodity ?? '').trim();
    const system = String(req.query.system ?? '').trim();
    if (!commodity || !system) {
      res.status(400).json({ error: 'commodity and system are required' });
      return;
    }
    try {
      const sources = await fetchCommoditySources(commodity, system);
      res.json({ sources });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : 'sourcing failed' });
    }
  });

  // Delete (dismiss) a tracked colonisation project.
  app.post('/api/colonisation/projects/:marketId/delete', (req, res) => {
    const marketId = Number(req.params.marketId);
    if (!Number.isFinite(marketId)) {
      res.status(400).json({ error: 'invalid marketId' });
      return;
    }
    const at = new Date().toISOString();
    dismissProject(events, marketId, at);
    const col = store.getState().colonisation;
    store.update('colonisation', {
      projects: col.projects.filter((p) => p.marketId !== marketId),
      dismissedAt: { ...col.dismissedAt, [String(marketId)]: at },
    });
    res.json({ ok: true });
  });

  // Best one-stop shops: stations near `system` selling the most of `commodities`.
  app.post('/api/colonisation/best-stops', async (req, res) => {
    const { commodities, system } = req.body as { commodities?: unknown; system?: unknown };
    if (!Array.isArray(commodities) || commodities.length === 0 || typeof system !== 'string') {
      res.status(400).json({ error: 'commodities[] and system are required' });
      return;
    }
    try {
      const stops = await fetchBestStops(commodities.map(String), system);
      res.json({ stops });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : 'sourcing failed' });
    }
  });

  // Serve the built Angular app when it exists (prod mode).
  const frontendDist = path.join(import.meta.dirname, '../../../frontend/dist/frontend/browser');
  if (fs.existsSync(frontendDist)) {
    app.use(express.static(frontendDist));
    app.get(/^\/(?!api|ws).*/, (_req, res) => {
      res.sendFile(path.join(frontendDist, 'index.html'));
    });
  }

  return http.createServer(app);
}
