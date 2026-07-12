import { Router } from 'express';
import type { AuthRequest } from '@ed/shared';
import type { UserRepo } from './users.js';
import type { IngestTokenRepo } from './ingest-tokens.js';
import { SESSION_COOKIE, sessionCookieOptions, signSession } from './session.js';
import { requireAuth } from './middleware.js';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function authRouter(users: UserRepo, tokens: IngestTokenRepo): Router {
  const r = Router();

  r.post('/auth/register', async (req, res) => {
    const { email, password, displayName } = (req.body ?? {}) as AuthRequest;
    if (!email || !EMAIL_RE.test(email)) {
      res.status(400).json({ error: 'valid email required' });
      return;
    }
    if (!password || password.length < 8) {
      res.status(400).json({ error: 'password must be at least 8 characters' });
      return;
    }
    if (await users.findByEmail(email)) {
      res.status(409).json({ error: 'email already registered' });
      return;
    }
    const user = await users.create(email, password, displayName?.trim() || null);
    res.cookie(SESSION_COOKIE, signSession(user.id), sessionCookieOptions());
    res.json({ user });
  });

  r.post('/auth/login', async (req, res) => {
    const { email, password } = (req.body ?? {}) as AuthRequest;
    const user = email && password ? await users.verify(email, password) : null;
    if (!user) {
      res.status(401).json({ error: 'invalid credentials' });
      return;
    }
    res.cookie(SESSION_COOKIE, signSession(user.id), sessionCookieOptions());
    res.json({ user });
  });

  r.post('/auth/logout', (_req, res) => {
    res.clearCookie(SESSION_COOKIE, { ...sessionCookieOptions(), maxAge: undefined });
    res.json({ ok: true });
  });

  r.get('/auth/me', requireAuth, async (req, res) => {
    const user = await users.findById(req.userId!);
    if (!user) {
      res.status(401).json({ error: 'unauthenticated' });
      return;
    }
    res.json({ user });
  });

  // ── Ingest tokens (client-app credentials) ────────────────────────────────
  r.get('/tokens', requireAuth, async (req, res) => {
    res.json({ tokens: await tokens.list(req.userId!) });
  });

  r.post('/tokens', requireAuth, async (req, res) => {
    const label = String((req.body?.label ?? '').toString().trim()) || 'client';
    res.json({ token: await tokens.create(req.userId!, label) });
  });

  r.delete('/tokens/:id', requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: 'invalid id' });
      return;
    }
    await tokens.revoke(req.userId!, id);
    res.json({ ok: true });
  });

  return r;
}
