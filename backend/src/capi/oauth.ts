import crypto from 'node:crypto';
import { config } from '../config.js';

/**
 * Frontier cAPI OAuth2 (Authorization Code + PKCE, public client — no secret).
 * Docs: https://hosting.zaonce.net/docs/oauth2/instructions.html
 */

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  /** Seconds until the access token expires. */
  expires_in: number;
  token_type: string;
}

const base64url = (buf: Buffer): string =>
  buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** A fresh PKCE verifier (kept server-side) and its S256 challenge (sent to Frontier). */
export function createPkce(): { verifier: string; challenge: string } {
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

export function randomState(): string {
  return base64url(crypto.randomBytes(16));
}

export function buildAuthUrl(state: string, challenge: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.capi.clientId,
    redirect_uri: config.capi.redirectUri,
    scope: 'auth capi',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  return `${config.capi.authBase}/auth?${params.toString()}`;
}

async function postToken(body: URLSearchParams): Promise<TokenResponse> {
  const res = await fetch(`${config.capi.authBase}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    throw new Error(`token endpoint ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return (await res.json()) as TokenResponse;
}

export function exchangeCode(code: string, verifier: string): Promise<TokenResponse> {
  return postToken(
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.capi.redirectUri,
      client_id: config.capi.clientId,
      code_verifier: verifier,
    }),
  );
}

export function refreshTokens(refreshToken: string): Promise<TokenResponse> {
  return postToken(
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: config.capi.clientId,
    }),
  );
}
