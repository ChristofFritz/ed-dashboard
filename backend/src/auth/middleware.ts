import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { SESSION_COOKIE, verifySession } from './session.js';
import type { IngestTokenRepo } from './ingest-tokens.js';

/** Require a valid dashboard session cookie; sets req.userId. */
export const requireAuth: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  const token = req.cookies?.[SESSION_COOKIE];
  const uid = token ? verifySession(token) : null;
  if (uid == null) {
    res.status(401).json({ error: 'unauthenticated' });
    return;
  }
  req.userId = uid;
  next();
};

/** Require a valid ingest token (Authorization: Bearer …); sets req.userId. */
export function requireIngestToken(tokens: IngestTokenRepo): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const header = req.get('authorization') ?? '';
    const match = /^Bearer\s+(.+)$/i.exec(header);
    if (!match) {
      res.status(401).json({ error: 'missing bearer token' });
      return;
    }
    const uid = await tokens.resolve(match[1]!.trim());
    if (uid == null) {
      res.status(401).json({ error: 'invalid token' });
      return;
    }
    req.userId = uid;
    next();
  };
}
