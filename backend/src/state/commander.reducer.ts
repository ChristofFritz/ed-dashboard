import type { CommanderState, JournalEvent } from '@ed/shared';
import { loc } from '@ed/shared';

export function commanderReducer(slice: CommanderState, e: JournalEvent): CommanderState {
  switch (e.event) {
    case 'Commander':
      return { ...slice, name: e.Name };
    case 'LoadGame':
      return {
        ...slice,
        name: e.Commander,
        credits: e.Credits,
        ship: e.Ship ? loc(e, 'Ship') : slice.ship,
        shipInternal: e.Ship?.toLowerCase() ?? slice.shipInternal,
        shipName: e.ShipName?.trim() || slice.shipName,
        shipIdent: e.ShipIdent ?? slice.shipIdent,
      };
    case 'ShipyardSwap':
    case 'ShipyardNew':
      return {
        ...slice,
        ship: loc(e, 'ShipType'),
        shipInternal: e.ShipType.toLowerCase(),
        // Name/ident belong to the old ship; the Loadout that follows fills them in.
        shipName: null,
        shipIdent: null,
      };
    case 'Rank':
      return {
        ...slice,
        ranks: {
          combat: e.Combat,
          trade: e.Trade,
          explore: e.Explore,
          exobiologist: e.Exobiologist,
          soldier: e.Soldier,
        },
      };
    case 'Loadout': {
      // Loadout only has the internal ship name; keep the localised one from
      // LoadGame/ShipyardSwap unless the ship actually changed.
      const sameShip = slice.shipInternal === e.Ship?.toLowerCase();
      return {
        ...slice,
        ship: sameShip ? slice.ship : e.Ship,
        shipInternal: e.Ship?.toLowerCase() ?? slice.shipInternal,
        shipName: e.ShipName?.trim() || (sameShip ? slice.shipName : null),
        shipIdent: e.ShipIdent,
        fuel: slice.fuel
          ? { ...slice.fuel, capacity: e.FuelCapacity?.Main ?? slice.fuel.capacity }
          : e.FuelCapacity
            ? { main: e.FuelCapacity.Main, reservoir: e.FuelCapacity.Reserve, capacity: e.FuelCapacity.Main }
            : null,
      };
    }
    case 'Location':
      return {
        ...slice,
        systemName: e.StarSystem,
        systemAddress: e.SystemAddress,
        station: e.StationName ?? null,
        body: e.Body ?? null,
        docked: e.Docked ?? false,
      };
    case 'FSDJump':
      return {
        ...slice,
        systemName: e.StarSystem,
        systemAddress: e.SystemAddress,
        station: null,
        body: null,
        docked: false,
      };
    case 'Docked':
      return { ...slice, station: e.StationName, docked: true, systemName: e.StarSystem };
    case 'Undocked':
      return { ...slice, docked: false };
    case 'ApproachBody':
      return { ...slice, body: e.Body };
    case 'LeaveBody':
      return { ...slice, body: null };
    default:
      return slice;
  }
}
