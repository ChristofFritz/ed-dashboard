import type { JournalEvent, TargetState } from '@ed/shared';
import { loc } from '@ed/shared';
import { initialTarget } from './initial.js';

const MAX_BOUNTIES = 20;

export function targetReducer(slice: TargetState, e: JournalEvent): TargetState {
  switch (e.event) {
    case 'LoadGame':
      return initialTarget();
    case 'FSDJump':
    case 'SupercruiseEntry':
      // Leaving the target behind — target lock is dropped in-game.
      return slice.current ? { ...slice, current: null } : slice;
    case 'ShipTargeted': {
      if (!e.TargetLocked) return { ...slice, current: null };
      const prev = slice.current;
      const ship = loc(e, 'Ship') || prev?.ship || '?';
      // Scan stages only add fields; keep earlier-stage data when re-targeting.
      const samePrev = prev && prev.ship === ship ? prev : null;
      return {
        ...slice,
        current: {
          ship,
          scanStage: e.ScanStage ?? 0,
          pilotName: e.PilotName ? loc(e, 'PilotName') : samePrev?.pilotName,
          pilotRank: e.PilotRank ?? samePrev?.pilotRank,
          faction: e.Faction ?? samePrev?.faction,
          legalStatus: e.LegalStatus ?? samePrev?.legalStatus,
          bounty: e.Bounty ?? samePrev?.bounty,
          shieldHealth: e.ShieldHealth ?? samePrev?.shieldHealth,
          hullHealth: e.HullHealth ?? samePrev?.hullHealth,
          subsystem: e.Subsystem ? loc(e, 'Subsystem') : samePrev?.subsystem,
          subsystemHealth: e.SubsystemHealth ?? samePrev?.subsystemHealth,
          targetedAt: e.timestamp,
        },
      };
    }
    case 'Bounty': {
      const entry = {
        timestamp: e.timestamp,
        target: loc(e, 'Target') || 'unknown',
        pilotName: e.PilotName ? loc(e, 'PilotName') : undefined,
        victimFaction: e.VictimFaction,
        reward: e.TotalReward ?? 0,
      };
      return {
        ...slice,
        current: null, // target destroyed
        recentBounties: [entry, ...slice.recentBounties].slice(0, MAX_BOUNTIES),
        sessionBountyTotal: slice.sessionBountyTotal + entry.reward,
        sessionKills: slice.sessionKills + 1,
      };
    }
    default:
      return slice;
  }
}
