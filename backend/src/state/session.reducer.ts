import type { Activity, JournalEvent, SessionEarnings, SessionState } from '@ed/shared';
import { initialSession } from './initial.js';

const ACTIVITY_EVENTS: Record<string, Activity> = {
  ProspectedAsteroid: 'mining',
  MiningRefined: 'mining',
  LaunchDrone: 'mining',
  AsteroidCracked: 'mining',
  ShipTargeted: 'combat',
  Bounty: 'combat',
  UnderAttack: 'combat',
  HullDamage: 'combat',
  Interdicted: 'combat',
  FSSDiscoveryScan: 'exploration',
  FSSAllBodiesFound: 'exploration',
  FSSBodySignals: 'exploration',
  SAAScanComplete: 'exploration',
  SAASignalsFound: 'exploration',
  ScanOrganic: 'exploration',
  MultiSellExplorationData: 'exploration',
};

function detectActivity(slice: SessionState, e: JournalEvent): SessionState {
  let activity = ACTIVITY_EVENTS[e.event];
  // Detailed scans indicate exploring; AutoScans on jump-in do not.
  if (e.event === 'Scan' && e.ScanType === 'Detailed') activity = 'exploration';
  if (e.event === 'ShipTargeted' && !e.TargetLocked) activity = undefined;
  return activity && activity !== slice.activity ? { ...slice, activity } : slice;
}

function withEarnings(slice: SessionState, patch: Partial<SessionEarnings>): SessionState {
  const earnings = { ...slice.earnings, ...patch };
  earnings.total =
    earnings.bounties +
    earnings.explorationSold +
    earnings.exobiologySold +
    earnings.tradeSales +
    earnings.missions +
    earnings.vouchers;
  return { ...slice, earnings };
}

export function sessionReducer(slice: SessionState, e: JournalEvent): SessionState {
  slice = detectActivity(slice, e);
  switch (e.event) {
    case 'LoadGame':
      return { ...initialSession(), startedAt: e.timestamp, gameMode: e.GameMode ?? null };
    case 'Bounty':
      return withEarnings(slice, { bounties: slice.earnings.bounties + (e.TotalReward ?? 0) });
    case 'RedeemVoucher':
      // Bounties are counted at kill time (Bounty event); redeeming the voucher
      // is the same money arriving, not new income.
      if (e.Type === 'bounty') return slice;
      return withEarnings(slice, { vouchers: slice.earnings.vouchers + (e.Amount ?? 0) });
    case 'MultiSellExplorationData':
    case 'SellExplorationData':
      return withEarnings(slice, {
        explorationSold: slice.earnings.explorationSold + (e.TotalEarnings ?? 0),
      });
    case 'SellOrganicData': {
      const sum = (e.BioData ?? []).reduce((acc, b) => acc + (b.Value ?? 0) + (b.Bonus ?? 0), 0);
      return withEarnings(slice, { exobiologySold: slice.earnings.exobiologySold + sum });
    }
    case 'MarketSell': {
      const profit = (e.SellPrice - e.AvgPricePaid) * e.Count;
      return withEarnings(
        { ...slice, earnings: { ...slice.earnings, tradeProfit: slice.earnings.tradeProfit + profit } },
        { tradeSales: slice.earnings.tradeSales + (e.TotalSale ?? 0) },
      );
    }
    case 'MissionCompleted':
      return withEarnings(slice, { missions: slice.earnings.missions + (e.Reward ?? 0) });
    case 'FSDJump':
      return { ...slice, jumps: slice.jumps + 1, distanceJumpedLy: slice.distanceJumpedLy + (e.JumpDist ?? 0) };
    case 'Scan':
      // AutoScan fires for previously-scanned bodies on honk; count detailed scans only.
      if (e.ScanType === 'Detailed' || e.ScanType === 'Basic') {
        return { ...slice, bodiesScanned: slice.bodiesScanned + 1 };
      }
      return slice;
    case 'SAAScanComplete':
      return { ...slice, bodiesMapped: slice.bodiesMapped + 1 };
    case 'ScanOrganic':
      if (e.ScanType === 'Analyse') {
        return { ...slice, organicsSampled: slice.organicsSampled + 1 };
      }
      return slice;
    default:
      return slice;
  }
}
