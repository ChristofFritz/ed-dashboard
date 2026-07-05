import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import type { StateStore } from '../state/store.js';

export function createHttpServer(store: StateStore): http.Server {
  const app = express();

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });
  app.get('/api/state', (_req, res) => {
    res.json(store.getState());
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
