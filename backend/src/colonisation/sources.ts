/**
 * "Where can I buy this commodity for a carrier run?" — proxies Spansh's
 * station search (same market feed Inara uses) for the nearest sellers of a
 * commodity, sorted by distance from a reference system.
 */

const SPANSH_STATION_SEARCH = 'https://spansh.co.uk/api/stations/search';

/** Largest landing pad a station has: 'L' > 'M' > 'S', or null if unknown. */
export type PadSize = 'L' | 'M' | 'S';

export interface CommoditySource {
  station: string;
  system: string;
  distanceLy: number;
  buyPrice: number;
  supply: number;
  padSize: PadSize | null;
  stationType: string | null;
  /** Days since the market was last updated on Spansh. */
  updatedDaysAgo: number | null;
}

interface SpanshMarketEntry {
  commodity: string;
  buy_price: number;
  supply: number;
}
interface SpanshStation {
  name: string;
  system_name: string;
  distance: number;
  large_pads?: number;
  medium_pads?: number;
  small_pads?: number;
  type?: string;
  market_updated_at?: string;
  market?: SpanshMarketEntry[];
}

function maxPad(st: SpanshStation): PadSize | null {
  if ((st.large_pads ?? 0) > 0) return 'L';
  if ((st.medium_pads ?? 0) > 0) return 'M';
  if ((st.small_pads ?? 0) > 0) return 'S';
  return null;
}
interface SpanshResponse {
  results?: SpanshStation[];
}

export interface StopStation {
  station: string;
  system: string;
  distanceLy: number;
  padSize: string | null;
  stationType: string | null;
  /** Which of the requested commodities this station sells, with price/supply. */
  items: { commodity: string; buyPrice: number; supply: number }[];
}

/** Run thunks with bounded concurrency so we don't hammer Spansh. */
async function pool<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const out: T[] = new Array(tasks.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (i < tasks.length) {
      const idx = i++;
      out[idx] = await tasks[idx]!();
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * For a set of commodities, find the stations near `referenceSystem` that sell
 * the MOST of them at one place — a one-stop shop for a carrier/ship load.
 */
export async function fetchBestStops(
  commodities: string[],
  referenceSystem: string,
  perCommodity = 20,
): Promise<StopStation[]> {
  const uniq = [...new Set(commodities)].slice(0, 30);
  const results = await pool(
    uniq.map((c) => async () => ({
      commodity: c,
      sources: await fetchCommoditySources(c, referenceSystem, perCommodity).catch(
        () => [] as CommoditySource[],
      ),
    })),
    6,
  );

  const byStation = new Map<string, StopStation>();
  for (const { commodity, sources } of results) {
    for (const s of sources) {
      const key = `${s.system}::${s.station}`;
      let st = byStation.get(key);
      if (!st) {
        st = {
          station: s.station,
          system: s.system,
          distanceLy: s.distanceLy,
          padSize: s.padSize,
          stationType: s.stationType,
          items: [],
        };
        byStation.set(key, st);
      }
      if (!st.items.some((i) => i.commodity === commodity)) {
        st.items.push({ commodity, buyPrice: s.buyPrice, supply: s.supply });
      }
    }
  }

  return [...byStation.values()]
    .sort((a, b) => b.items.length - a.items.length || a.distanceLy - b.distanceLy)
    .slice(0, 12);
}

export async function fetchCommoditySources(
  commodity: string,
  referenceSystem: string,
  limit = 8,
): Promise<CommoditySource[]> {
  const body = {
    filters: {
      market: [
        { name: commodity, supply: { value: [1, 999_999_999], comparison: '<=>' } },
      ],
    },
    sort: [{ distance: { direction: 'asc' } }],
    size: Math.min(limit, 25),
    page: 0,
    reference_system: referenceSystem,
  };

  const res = await fetch(SPANSH_STATION_SEARCH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Spansh station search ${res.status}`);
  const data = (await res.json()) as SpanshResponse;

  const now = Date.now();
  const out: CommoditySource[] = [];
  for (const st of data.results ?? []) {
    const entry = (st.market ?? []).find((m) => m.commodity === commodity && m.supply > 0);
    if (!entry) continue;
    out.push({
      station: st.name,
      system: st.system_name,
      distanceLy: Math.round(st.distance * 10) / 10,
      buyPrice: entry.buy_price,
      supply: entry.supply,
      padSize: maxPad(st),
      stationType: st.type ?? null,
      updatedDaysAgo: st.market_updated_at
        ? Math.round((now - Date.parse(st.market_updated_at)) / 86_400_000)
        : null,
    });
  }
  return out;
}
