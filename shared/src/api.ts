/** DTOs for the hosted client/server/dashboard protocol. */

// ── Auth ──────────────────────────────────────────────────────────────────

export interface PublicUser {
  id: number;
  email: string;
  displayName: string | null;
  createdAt: string;
}

export interface AuthRequest {
  email: string;
  password: string;
  displayName?: string;
}

export interface AuthResponse {
  user: PublicUser;
}

// ── Ingest tokens (used by the client app) ──────────────────────────────────

/** Metadata about an ingest token. The secret is only returned once, at creation. */
export interface IngestTokenInfo {
  id: number;
  label: string;
  /** Last 4 chars of the token, for identification in the UI. */
  suffix: string;
  createdAt: string;
  lastUsedAt: string | null;
}

/** Returned once when a token is created — includes the full secret. */
export interface IngestTokenCreated extends IngestTokenInfo {
  token: string;
}

// ── Ingest payload (client -> server) ───────────────────────────────────────

/** A batch of raw journal lines from one journal file. */
export interface IngestJournalBatch {
  filename: string;
  /** Raw journal lines with their line numbers (1-based within the file). */
  events: { lineNo: number; raw: string }[];
}

export type SidecarFileName = 'Status.json' | 'Cargo.json' | 'NavRoute.json' | 'Market.json';

export interface IngestSidecar {
  file: SidecarFileName;
  data: unknown;
}

export interface IngestPayload {
  batches?: IngestJournalBatch[];
  sidecars?: IngestSidecar[];
}

export interface IngestResponse {
  ok: true;
  /** Events accepted (after de-dupe) this request. */
  accepted: number;
}

// ── Soketi / Pusher config exposed to the dashboard ─────────────────────────

export interface PusherConfig {
  key: string;
  cluster: string;
  /**
   * Same-origin path the Soketi websocket is proxied under (e.g. "/soketi").
   * The dashboard connects to its own host/port/scheme + this path, so it works
   * over plain HTTP, HTTPS, LAN, or a domain without exposing Soketi directly.
   */
  wsPath: string;
}

/** Runtime config the dashboard fetches at boot (no secrets). */
export interface DashboardConfig {
  pusher: PusherConfig;
  user: PublicUser;
  /** The private channel this user's state is published on. */
  channel: string;
}
