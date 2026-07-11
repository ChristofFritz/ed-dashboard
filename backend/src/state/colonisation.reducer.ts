import type { AppState, ColonisationProject, ColonisationState, JournalEvent } from '@ed/shared';
import { commodityId, loc } from '@ed/shared';

/** Station types that are colonisation construction sites. */
export const CONSTRUCTION_STATION_TYPES = new Set([
  'PlanetaryConstructionDepot',
  'SpaceConstructionDepot',
]);

/** Refresh a tracked project's name (renames only ever come from later events). */
function rename(
  slice: ColonisationState,
  marketId: number | undefined,
  name: string | undefined,
): ColonisationState {
  if (marketId == null || !name) return slice;
  const idx = slice.projects.findIndex((p) => p.marketId === marketId);
  if (idx === -1 || slice.projects[idx]!.stationName === name) return slice;
  const projects = [...slice.projects];
  projects[idx] = { ...projects[idx]!, stationName: name };
  return { ...slice, projects };
}

/** A deleted project stays hidden until a depot/dock event newer than the deletion. */
function stillDismissed(slice: ColonisationState, marketId: number, ts: string): boolean {
  const at = slice.dismissedAt[String(marketId)];
  return at != null && Date.parse(ts) <= Date.parse(at);
}

/** Clear a project's dismissal (it's being resurrected by newer activity). */
function clearDismiss(slice: ColonisationState, marketId: number): Record<string, string> {
  if (!(String(marketId) in slice.dismissedAt)) return slice.dismissedAt;
  const next = { ...slice.dismissedAt };
  delete next[String(marketId)];
  return next;
}

function upsert(
  projects: ColonisationProject[],
  marketId: number,
  patch: (existing: ColonisationProject | undefined) => ColonisationProject,
): ColonisationProject[] {
  const idx = projects.findIndex((p) => p.marketId === marketId);
  if (idx === -1) return [...projects, patch(undefined)];
  const next = [...projects];
  next[idx] = patch(projects[idx]);
  return next;
}

export function colonisationReducer(
  slice: ColonisationState,
  e: JournalEvent,
  state: Readonly<AppState>,
): ColonisationState {
  switch (e.event) {
    case 'Docked': {
      if (e.MarketID == null || !e.StationType || !CONSTRUCTION_STATION_TYPES.has(e.StationType)) {
        return slice;
      }
      const marketId = e.MarketID;
      if (stillDismissed(slice, marketId, e.timestamp)) return slice;
      const dismissedAt = clearDismiss(slice, marketId);
      const projects = upsert(slice.projects, marketId, (ex) => ({
        marketId,
        stationName: e.StationName,
        systemName: e.StarSystem,
        systemAddress: e.SystemAddress,
        stationType: e.StationType ?? null,
        faction: e.StationFaction?.Name ?? ex?.faction ?? null,
        progress: ex?.progress ?? 0,
        complete: ex?.complete ?? false,
        failed: ex?.failed ?? false,
        commodities: ex?.commodities ?? [],
        updatedAt: ex?.updatedAt ?? e.timestamp,
      }));
      return { ...slice, projects, activeMarketId: marketId, dismissedAt };
    }

    case 'Undocked': {
      // A rename done while docked first surfaces here (Docked kept the old name).
      const renamed = rename(slice, e.MarketID, e.StationName);
      return { ...renamed, activeMarketId: null, dockedMarket: null };
    }

    case 'FSDJump':
      // Left the system entirely; drop any stale docked-market snapshot.
      return slice.dockedMarket == null ? slice : { ...slice, dockedMarket: null };

    case 'Location': {
      // Relog while docked, or a fly-by — carries the current (renamed) name.
      let next = rename(slice, e.MarketID, e.StationName);
      if (
        e.Docked &&
        e.MarketID != null &&
        e.StationType &&
        CONSTRUCTION_STATION_TYPES.has(e.StationType)
      ) {
        next = { ...next, activeMarketId: e.MarketID };
      }
      return next;
    }

    case 'ApproachSettlement':
      return rename(slice, e.MarketID, e.Name);

    case 'ColonisationConstructionDepot': {
      const marketId = e.MarketID;
      if (stillDismissed(slice, marketId, e.timestamp)) return slice;
      const dismissedAt = clearDismiss(slice, marketId);
      const commander = state.commander;
      const projects = upsert(slice.projects, marketId, (ex) => ({
        marketId,
        // Depot events carry no station name; keep what Docked captured, else
        // fall back to the commander slice (we're docked when this fires).
        stationName: ex?.stationName ?? commander.station ?? `Construction Site ${marketId}`,
        systemName: ex?.systemName ?? commander.systemName,
        systemAddress: ex?.systemAddress ?? commander.systemAddress,
        stationType: ex?.stationType ?? null,
        faction: ex?.faction ?? null,
        progress: e.ConstructionProgress,
        complete: e.ConstructionComplete,
        failed: e.ConstructionFailed,
        commodities: e.ResourcesRequired.map((r) => ({
          name: commodityId(r.Name),
          locName: r.Name_Localised ?? loc(r, 'Name'),
          required: r.RequiredAmount,
          provided: r.ProvidedAmount,
          payment: r.Payment,
        })),
        updatedAt: e.timestamp,
      }));
      return { ...slice, projects, dismissedAt };
    }

    case 'Loadout':
      // Fires on every ship swap/board; ?? 0 so a no-cargo ship reads 0, not stale.
      return { ...slice, shipCapacity: e.CargoCapacity ?? 0 };

    case 'Cargo': {
      // The live Cargo event usually omits Inventory ("read Cargo.json"); the
      // Cargo.json sidecar is the real source (see applySidecar). Only act when
      // the inventory is actually inline, else leave the sidecar's value alone.
      if (e.Vessel !== 'Ship' || !e.Inventory) return slice;
      const shipCargo = e.Inventory.map((i) => ({
        name: i.Name.toLowerCase(),
        locName: i.Name_Localised ?? loc(i, 'Name'),
        tons: i.Count,
      }));
      return { ...slice, shipCargo };
    }

    default:
      return slice;
  }
}
