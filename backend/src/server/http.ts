import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import type { StateStore } from '../state/store.js';
import type { CapiService } from '../capi/service.js';

export function createHttpServer(store: StateStore, capi: CapiService): http.Server {
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
