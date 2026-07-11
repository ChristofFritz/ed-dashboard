import type {
  ApproachSettlementEvent,
  ColonisationConstructionDepotEvent,
  ColonisationProject,
  DockedEvent,
  LoadoutEvent,
  LocationEvent,
  UndockedEvent,
} from '@ed/shared';
import { commodityId, loc } from '@ed/shared';
import type { EventStore } from '../db/event-store.js';
import type { StateStore } from './store.js';
import { CONSTRUCTION_STATION_TYPES } from './colonisation.reducer.js';
import { getDismissed, isDismissed } from './colonisation.dismiss.js';

/**
 * Rebuild known colonisation projects from the full event history so sites
 * visited in past sessions survive a restart. The newest-journal hydration
 * replay runs after this and refreshes any project touched this session.
 */
export function seedColonisation(events: EventStore, store: StateStore): void {
  // Station metadata per construction MarketID, from Docked events (latest wins).
  const meta = new Map<number, DockedEvent>();
  for (const json of events.eventsOfType('Docked')) {
    const d = JSON.parse(json) as DockedEvent;
    if (d.MarketID != null && d.StationType && CONSTRUCTION_STATION_TYPES.has(d.StationType)) {
      meta.set(d.MarketID, d);
    }
  }

  // Latest depot snapshot per MarketID.
  const depots = new Map<number, ColonisationConstructionDepotEvent>();
  for (const json of events.eventsOfType('ColonisationConstructionDepot')) {
    const dp = JSON.parse(json) as ColonisationConstructionDepotEvent;
    depots.set(dp.MarketID, dp);
  }

  // Latest name per MarketID across every event that carries one — renames
  // surface in Undocked/Location/ApproachSettlement, not a fresh Docked.
  const nameByMarket = new Map<number, string>();
  const nameEvents: { ts: string; marketId: number; name: string }[] = [];
  for (const json of events.eventsOfType('Docked')) {
    const e = JSON.parse(json) as DockedEvent;
    if (e.MarketID != null && e.StationName) nameEvents.push({ ts: e.timestamp, marketId: e.MarketID, name: e.StationName });
  }
  for (const json of events.eventsOfType('Undocked')) {
    const e = JSON.parse(json) as UndockedEvent;
    if (e.MarketID != null && e.StationName) nameEvents.push({ ts: e.timestamp, marketId: e.MarketID, name: e.StationName });
  }
  for (const json of events.eventsOfType('Location')) {
    const e = JSON.parse(json) as LocationEvent;
    if (e.MarketID != null && e.StationName) nameEvents.push({ ts: e.timestamp, marketId: e.MarketID, name: e.StationName });
  }
  for (const json of events.eventsOfType('ApproachSettlement')) {
    const e = JSON.parse(json) as ApproachSettlementEvent;
    if (e.MarketID != null && e.Name) nameEvents.push({ ts: e.timestamp, marketId: e.MarketID, name: e.Name });
  }
  nameEvents.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
  for (const n of nameEvents) nameByMarket.set(n.marketId, n.name);

  const dismissed = getDismissed(events);
  const marketIds = new Set<number>([...meta.keys(), ...depots.keys()]);
  const projects: ColonisationProject[] = [];
  for (const marketId of marketIds) {
    const d = meta.get(marketId);
    const dp = depots.get(marketId);
    const updatedAt = dp?.timestamp ?? d?.timestamp ?? new Date(0).toISOString();
    // Deleted by the user, and no newer depot activity to resurrect it.
    if (isDismissed(dismissed, marketId, updatedAt)) continue;
    projects.push({
      marketId,
      stationName: nameByMarket.get(marketId) ?? d?.StationName ?? `Construction Site ${marketId}`,
      systemName: d?.StarSystem ?? null,
      systemAddress: d?.SystemAddress ?? null,
      stationType: d?.StationType ?? null,
      faction: d?.StationFaction?.Name ?? null,
      progress: dp?.ConstructionProgress ?? 0,
      complete: dp?.ConstructionComplete ?? false,
      failed: dp?.ConstructionFailed ?? false,
      commodities: (dp?.ResourcesRequired ?? []).map((r) => ({
        name: commodityId(r.Name),
        locName: r.Name_Localised ?? loc(r, 'Name'),
        required: r.RequiredAmount,
        provided: r.ProvidedAmount,
        payment: r.Payment,
      })),
      updatedAt,
    });
  }

  // Ship cargo capacity from the most recent Loadout (0 = no cargo hold).
  const loadouts = events.eventsOfType('Loadout');
  const lastLoadout = loadouts.length
    ? (JSON.parse(loadouts[loadouts.length - 1]!) as LoadoutEvent)
    : null;
  const shipCapacity = lastLoadout ? (lastLoadout.CargoCapacity ?? 0) : null;

  const patch: {
    projects?: ColonisationProject[];
    shipCapacity?: number | null;
    dismissedAt: Record<string, string>;
  } = { dismissedAt: dismissed };
  if (projects.length > 0) patch.projects = projects;
  if (shipCapacity !== null) patch.shipCapacity = shipCapacity;
  store.update('colonisation', patch);
}
