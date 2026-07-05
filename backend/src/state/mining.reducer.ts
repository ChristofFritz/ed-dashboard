import type { JournalEvent, MiningState } from '@ed/shared';
import { loc } from '@ed/shared';
import { initialMining } from './initial.js';

export function miningReducer(slice: MiningState, e: JournalEvent): MiningState {
  switch (e.event) {
    case 'LoadGame':
      return { ...initialMining(), cargo: slice.cargo, cargoCount: slice.cargoCount, cargoCapacity: slice.cargoCapacity };
    case 'Loadout':
      return { ...slice, cargoCapacity: e.CargoCapacity ?? slice.cargoCapacity };
    case 'ProspectedAsteroid':
      return {
        ...slice,
        lastProspected: {
          timestamp: e.timestamp,
          materials: (e.Materials ?? []).map((m) => ({
            name: loc(m, 'Name'),
            proportion: m.Proportion,
          })),
          content: loc(e, 'Content').replace(
            /^AsteroidMaterialContent /,
            '',
          ),
          motherlode: e.MotherlodeMaterial
            ? loc(e, 'MotherlodeMaterial')
            : undefined,
          remaining: Math.min(100, Math.max(0, e.Remaining ?? 0)),
        },
      };
    case 'MiningRefined': {
      const name = loc(e, 'Type');
      return {
        ...slice,
        refinedCounts: { ...slice.refinedCounts, [name]: (slice.refinedCounts[name] ?? 0) + 1 },
        refinedTotal: slice.refinedTotal + 1,
      };
    }
    case 'LaunchDrone':
      if (e.Type === 'Prospector' || e.Type === 'Collection') {
        return { ...slice, limpetsLaunched: slice.limpetsLaunched + 1 };
      }
      return slice;
    default:
      return slice;
  }
}
