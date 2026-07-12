import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export const SESSION_COOKIE = 'ed_session';

interface SessionPayload {
  uid: number;
}

export function signSession(userId: number): string {
  return jwt.sign({ uid: userId } satisfies SessionPayload, config.jwtSecret, {
    expiresIn: `${config.sessionTtlDays}d`,
  });
}

export function verifySession(token: string): number | null {
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as SessionPayload;
    return typeof decoded.uid === 'number' ? decoded.uid : null;
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: config.secureCookies,
    sameSite: 'lax' as const,
    maxAge: config.sessionTtlDays * 24 * 60 * 60 * 1000,
    path: '/',
  };
}
