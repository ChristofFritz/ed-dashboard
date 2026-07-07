import type { CarrierCommodity } from '@ed/shared';
import { config } from '../config.js';

export interface FleetCarrierData {
  callsign: string | null;
  name: string | null;
  cargo: CarrierCommodity[];
  totalTons: number;
}

/** Signals no carrier is owned (cAPI 204). */
export const NO_CARRIER = Symbol('no-carrier');

export interface RawCargo {
  commodity?: string;
  locName?: string;
  qty?: number | string;
  value?: number | string;
  stolen?: boolean;
}

const num = (v: unknown): number => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : 0;
  return Number.isFinite(n) ? n : 0;
};

export function parseCargo(raw: RawCargo[]): CarrierCommodity[] {
  // The cAPI returns one entry per stack (origin/mission/stolen split); merge by commodity.
  const byId = new Map<string, CarrierCommodity>();
  for (const r of raw) {
    const id = r.commodity ?? r.locName;
    if (!id) continue;
    const tons = num(r.qty);
    if (tons <= 0) continue;
    const existing = byId.get(id);
    if (existing) {
      existing.tons += tons;
      existing.stolen ||= r.stolen === true;
      existing.value = (existing.value ?? 0) + num(r.value);
    } else {
      byId.set(id, {
        name: r.commodity ?? id,
        locName: r.locName ?? r.commodity ?? id,
        tons,
        stolen: r.stolen === true,
        value: r.value != null ? num(r.value) : null,
      });
    }
  }
  return [...byId.values()].sort((a, b) => b.tons - a.tons);
}

/**
 * Fetch the commander's fleet carrier from the cAPI.
 * Returns NO_CARRIER on 204, throws on auth/other failures (caller handles 401).
 */
export async function fetchFleetCarrier(accessToken: string): Promise<FleetCarrierData | typeof NO_CARRIER> {
  const res = await fetch(`${config.capi.apiBase}/fleetcarrier`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 204) return NO_CARRIER;
  if (res.status === 401 || res.status === 403) {
    throw new AuthError(`cAPI auth failed (${res.status})`);
  }
  if (!res.ok) throw new Error(`cAPI /fleetcarrier ${res.status}`);

  const d = (await res.json()) as {
    name?: { callsign?: string; vanityName?: string } | string;
    cargo?: RawCargo[];
  };
  const cargo = parseCargo(d.cargo ?? []);
  const nameObj = typeof d.name === 'object' ? d.name : null;
  return {
    callsign: nameObj?.callsign ?? (typeof d.name === 'string' ? d.name : null),
    name: nameObj?.vanityName ?? null,
    cargo,
    totalTons: cargo.reduce((sum, c) => sum + c.tons, 0),
  };
}

/** Thrown when the access token is rejected — caller should refresh or re-link. */
export class AuthError extends Error {}
