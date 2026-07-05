import type { CargoJson, NavRouteJson, StatusJson } from '@ed/shared';
import { loc } from '@ed/shared';
import type { StateStore } from '../state/store.js';
import type { SidecarFile } from './watcher.js';

const SCOOPABLE = new Set(['K', 'G', 'B', 'F', 'O', 'A', 'M']);

function distanceLy(a: [number, number, number], b: [number, number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export function applySidecar(store: StateStore, file: SidecarFile, data: unknown): void {
  switch (file) {
    case 'Status.json': {
      const s = data as StatusJson;
      const commander = store.getState().commander;
      store.update('commander', {
        credits: s.Balance ?? commander.credits,
        legalState: s.LegalState ?? null,
        pips: s.Pips ?? null,
        flags: s.Flags ?? 0,
        fuel: s.Fuel
          ? {
              main: s.Fuel.FuelMain,
              reservoir: s.Fuel.FuelReservoir,
              capacity: commander.fuel?.capacity ?? null,
            }
          : commander.fuel,
        statusStale: false,
      });
      break;
    }
    case 'Cargo.json': {
      const c = data as CargoJson;
      store.update('mining', {
        cargo: (c.Inventory ?? []).map((item) => ({
          name: loc(item as unknown as Record<string, unknown>, 'Name'),
          count: item.Count,
          stolen: item.Stolen,
        })),
        cargoCount: c.Count ?? 0,
      });
      break;
    }
    case 'NavRoute.json': {
      const r = data as NavRouteJson;
      const raw = r.Route ?? [];
      if (r.event === 'NavRouteClear' || raw.length === 0) {
        store.update('commander', { route: null });
        break;
      }
      let totalLy = 0;
      const hops = raw.map((hop, i) => {
        const prev = raw[i - 1];
        const legLy = prev ? distanceLy(prev.StarPos, hop.StarPos) : 0;
        totalLy += legLy;
        return {
          name: hop.StarSystem,
          systemAddress: hop.SystemAddress,
          starClass: hop.StarClass,
          scoopable: SCOOPABLE.has(hop.StarClass),
          legLy,
        };
      });
      store.update('commander', { route: { hops, totalLy } });
      break;
    }
  }
}
