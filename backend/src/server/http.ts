import express from 'express';
import http from 'node:http';
import httpProxy from 'http-proxy';
import cookieParser from 'cookie-parser';
import fs from 'node:fs';
import path from 'node:path';
import type { DashboardConfig } from '@ed/shared';
import { config } from '../config.js';
import type { EventStore } from '../db/event-store.js';
import type { SessionManager } from '../users/session-manager.js';
import type { UserRepo } from '../auth/users.js';
import type { IngestTokenRepo } from '../auth/ingest-tokens.js';
import { Publisher, channelFor } from '../pusher/publisher.js';
import { authRouter } from '../auth/routes.js';
import { ingestRouter } from '../ingest/routes.js';
import { requireAuth } from '../auth/middleware.js';
import { fetchBestStops, fetchCommoditySources } from '../colonisation/sources.js';
import { dismissProject } from '../state/colonisation.dismiss.js';

export interface HttpDeps {
  sessions: SessionManager;
  events: EventStore;
  users: UserRepo;
  tokens: IngestTokenRepo;
  publisher: Publisher;
}

export function createHttpServer(deps: HttpDeps): http.Server {
  const { sessions, events, users, tokens, publisher } = deps;
  const app = express();
  app.use(express.json({ limit: '8mb' }));
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/api', authRouter(users, tokens));
  app.use('/api', ingestRouter(sessions, events, tokens));

  // Runtime config for the dashboard (public Soketi params + who am I).
  app.get('/api/config', requireAuth, async (req, res) => {
    const user = await users.findById(req.userId!);
    if (!user) {
      res.status(401).json({ error: 'unauthenticated' });
      return;
    }
    const cfg: DashboardConfig = {
      user,
      channel: channelFor(user.id),
      pusher: {
        key: config.pusher.key,
        cluster: config.pusher.cluster,
        wsPath: config.pusher.wsPath,
      },
    };
    res.json(cfg);
  });

  // Current state snapshot (dashboard fetches this once, then listens on Soketi).
  app.get('/api/state', requireAuth, async (req, res) => {
    const session = await sessions.get(req.userId!);
    res.json(session.state.getState());
  });

  // Soketi private-channel authorisation. Only the channel's own user may join.
  app.post('/api/pusher/auth', requireAuth, (req, res) => {
    const socketId = String(req.body?.socket_id ?? '');
    const channel = String(req.body?.channel_name ?? '');
    if (!socketId || channel !== channelFor(req.userId!)) {
      res.status(403).json({ error: 'forbidden channel' });
      return;
    }
    res.json(publisher.authorize(socketId, channel));
  });

  // ── Frontier cAPI (fleet carrier), per user ────────────────────────────────
  app.get('/api/capi/login', requireAuth, async (req, res) => {
    const session = await sessions.get(req.userId!);
    res.redirect(session.capi.loginUrl());
  });
  app.post('/api/capi/exchange', requireAuth, async (req, res) => {
    const { code, state } = req.body as { code?: string; state?: string };
    if (!code || !state) {
      res.status(400).json({ error: 'missing code/state' });
      return;
    }
    try {
      const session = await sessions.get(req.userId!);
      await session.capi.handleCallback(code, state);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'exchange failed' });
    }
  });
  app.post('/api/capi/refresh', requireAuth, async (req, res) => {
    const session = await sessions.get(req.userId!);
    await session.capi.poll();
    res.json({ ok: true });
  });

  // ── Colonisation sourcing (Spansh) ─────────────────────────────────────────
  app.get('/api/colonisation/sources', requireAuth, async (req, res) => {
    const commodity = String(req.query.commodity ?? '').trim();
    const system = String(req.query.system ?? '').trim();
    if (!commodity || !system) {
      res.status(400).json({ error: 'commodity and system are required' });
      return;
    }
    try {
      res.json({ sources: await fetchCommoditySources(commodity, system) });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : 'sourcing failed' });
    }
  });

  app.post('/api/colonisation/best-stops', requireAuth, async (req, res) => {
    const { commodities, system } = req.body as { commodities?: unknown; system?: unknown };
    if (!Array.isArray(commodities) || commodities.length === 0 || typeof system !== 'string') {
      res.status(400).json({ error: 'commodities[] and system are required' });
      return;
    }
    try {
      res.json({ stops: await fetchBestStops(commodities.map(String), system) });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : 'sourcing failed' });
    }
  });

  app.post('/api/colonisation/projects/:marketId/delete', requireAuth, async (req, res) => {
    const marketId = Number(req.params.marketId);
    if (!Number.isFinite(marketId)) {
      res.status(400).json({ error: 'invalid marketId' });
      return;
    }
    const userId = req.userId!;
    const at = new Date().toISOString();
    await dismissProject(events, userId, marketId, at);
    const session = await sessions.get(userId);
    const col = session.state.getState().colonisation;
    session.state.update('colonisation', {
      projects: col.projects.filter((p) => p.marketId !== marketId),
      dismissedAt: { ...col.dismissedAt, [String(marketId)]: at },
    });
    res.json({ ok: true });
  });

  // Serve the built Angular app when it exists (prod / docker).
  const frontendDist = path.join(import.meta.dirname, '../../../frontend/dist/frontend/browser');
  if (fs.existsSync(frontendDist)) {
    app.use(express.static(frontendDist));
    app.get(/^\/(?!api).*/, (_req, res) => {
      res.sendFile(path.join(frontendDist, 'index.html'));
    });
  }

  const server = http.createServer(app);

  // Proxy the browser's Soketi websocket through this same origin (so it
  // inherits the page's http/https and needs no separate host/port). Requests
  // to `${wsPath}/app/<key>` are forwarded to Soketi with the prefix stripped.
  const soketiScheme = config.pusher.useTLS ? 'wss' : 'ws';
  const soketiTarget = `${soketiScheme}://${config.pusher.host}:${config.pusher.port}`;
  const wsProxy = httpProxy.createProxyServer({ target: soketiTarget, ws: true, changeOrigin: true });
  wsProxy.on('error', (err) => console.error('soketi ws proxy error:', err.message));
  const wsPrefix = config.pusher.wsPath;
  server.on('upgrade', (req, socket, head) => {
    if (!req.url || !req.url.startsWith(wsPrefix)) return;
    req.url = req.url.slice(wsPrefix.length) || '/';
    wsProxy.ws(req, socket, head);
  });

  return server;
}
