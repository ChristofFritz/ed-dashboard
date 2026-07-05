import type {
  AppState,
  CommanderState,
  ExplorationState,
  MiningState,
  SessionState,
  TargetState,
} from '@ed/shared';

export function initialExploration(): ExplorationState {
  return {
    systemName: null,
    systemAddress: null,
    bodyCount: null,
    nonBodyCount: null,
    scannedCount: 0,
    allBodiesFound: false,
    fssProgress: null,
    bodies: [],
    organicInProgress: null,
    organicsCompleted: [],
    systemEstimatedValue: 0,
    systemMappedValue: 0,
    edsm: { status: 'idle', knownBodyCount: null, interesting: [] },
  };
}

export function initialTarget(): TargetState {
  return { current: null, recentBounties: [], sessionBountyTotal: 0, sessionKills: 0 };
}

export function initialMining(): MiningState {
  return {
    lastProspected: null,
    refinedCounts: {},
    refinedTotal: 0,
    limpetsLaunched: 0,
    cargo: [],
    cargoCount: 0,
    cargoCapacity: null,
  };
}

export function initialSession(): SessionState {
  return {
    startedAt: null,
    gameMode: null,
    earnings: {
      bounties: 0,
      explorationSold: 0,
      exobiologySold: 0,
      tradeSales: 0,
      tradeProfit: 0,
      missions: 0,
      vouchers: 0,
      total: 0,
    },
    bodiesScanned: 0,
    bodiesMapped: 0,
    organicsSampled: 0,
    jumps: 0,
    distanceJumpedLy: 0,
    estimatedUnsoldExploration: 0,
    activity: 'overview',
  };
}

export function initialCommander(): CommanderState {
  return {
    name: null,
    credits: null,
    ship: null,
    shipInternal: null,
    shipName: null,
    shipIdent: null,
    systemName: null,
    systemAddress: null,
    station: null,
    body: null,
    docked: false,
    legalState: null,
    fuel: null,
    pips: null,
    flags: 0,
    ranks: null,
    route: null,
    statusStale: false,
  };
}

export function initialAppState(): AppState {
  return {
    exploration: initialExploration(),
    target: initialTarget(),
    mining: initialMining(),
    session: initialSession(),
    commander: initialCommander(),
  };
}
