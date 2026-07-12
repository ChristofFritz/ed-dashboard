import type { Db } from '../db/pg.js';
import type { EdsmInterestingBody } from '@ed/shared';

const EDSM_BODIES_URL = 'https://www.edsm.net/api-system-v1/bodies';
const TIMEOUT_MS = 5000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface EdsmSystemInfo {
  known: boolean;
  bodyCount: number | null;
  interesting: EdsmInterestingBody[];
}

interface EdsmBody {
  name?: string;
  type?: string;
  subType?: string;
  isLandable?: boolean;
  terraformingState?: string;
  distanceToArrival?: number;
}

/** High-value / notable planet sub-types worth flagging on arrival. */
const NOTABLE_SUBTYPES = [
  'Earth-like world',
  'Water world',
  'Ammonia world',
  'Metal-rich body',
];

/** Rough value tier for ordering (higher = show first). */
function interestRank(b: EdsmBody, terraformable: boolean): number {
  const sub = b.subType ?? '';
  if (sub.includes('Earth-like')) return 100;
  if (sub.includes('Ammonia world')) return 90;
  if (sub.includes('Water world')) return terraformable ? 85 : 70;
  if (terraformable) return 60;
  if (sub.includes('Metal-rich')) return 40;
  return 0;
}

function isInteresting(b: EdsmBody, terraformable: boolean): boolean {
  if (b.type !== 'Planet') return false;
  return terraformable || NOTABLE_SUBTYPES.some((s) => (b.subType ?? '').includes(s));
}

/**
 * EDSM lookups with a SQLite cache. Never throws — returns null on any
 * network/parse problem so the dashboard degrades to offline mode.
 */
export class EdsmClient {
  constructor(private db: Db) {}

  async systemBodies(systemName: string, systemAddress: number): Promise<EdsmSystemInfo | null> {
    const cached = (
      await this.db.query<{ json: string; fetched_at: Date }>(
        'SELECT json, fetched_at FROM edsm_cache WHERE system_address = $1',
        [systemAddress],
      )
    ).rows[0];
    if (cached && Date.now() - cached.fetched_at.getTime() < CACHE_TTL_MS) {
      return this.parse(cached.json);
    }

    try {
      const res = await fetch(`${EDSM_BODIES_URL}?systemName=${encodeURIComponent(systemName)}`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) return null;
      const text = await res.text();
      await this.db.query(
        'INSERT INTO edsm_cache (system_address, json, fetched_at) VALUES ($1, $2, now()) ' +
          'ON CONFLICT(system_address) DO UPDATE SET json = excluded.json, fetched_at = excluded.fetched_at',
        [systemAddress, text],
      );
      return this.parse(text);
    } catch {
      return null; // offline / timeout — stale cache is still better than nothing
    }
  }

  private parse(json: string): EdsmSystemInfo | null {
    try {
      const data = JSON.parse(json) as { name?: string; bodies?: EdsmBody[] };
      // Unknown systems come back as [] or {} without a name.
      if (!data?.name) return { known: false, bodyCount: null, interesting: [] };
      const bodies = data.bodies ?? [];
      const systemName = data.name;
      const interesting = bodies
        .map((b) => {
          const terraformable = b.terraformingState === 'Candidate for terraforming';
          return { b, terraformable, rank: interestRank(b, terraformable) };
        })
        .filter(({ b, terraformable }) => isInteresting(b, terraformable))
        .sort((a, z) => z.rank - a.rank || (a.b.distanceToArrival ?? 0) - (z.b.distanceToArrival ?? 0))
        .map(({ b, terraformable }): EdsmInterestingBody => {
          const name = b.name ?? '';
          const shortName = name.startsWith(systemName) ? name.slice(systemName.length).trim() || '★' : name;
          return {
            name,
            shortName,
            subType: b.subType ?? 'Unknown',
            terraformable,
            landable: b.isLandable ?? false,
            distanceLs: Math.round(b.distanceToArrival ?? 0),
          };
        });
      return { known: true, bodyCount: bodies.length, interesting };
    } catch {
      return null;
    }
  }
}
