/** Dashboard state slices pushed to the frontend. */

export type Activity = 'exploration' | 'combat' | 'mining' | 'overview';

// ── Exploration ─────────────────────────────────────────────────────────────

export interface BodyValueEstimate {
  scanValue: number;
  mappedValue: number;
  maxValue: number;
}

export interface BioSignalInfo {
  count: number;
  genuses: string[]; // localised genus names, known after DSS
}

export interface BioCandidate {
  genus: string;
  minValue: number;
  maxValue: number;
}

export interface BioPredictionInfo {
  candidates: BioCandidate[];
  maxValue: number;
}

export interface ExoBioProgress {
  bodyId: number;
  genus: string;
  species: string;
  variant?: string;
  samples: 0 | 1 | 2 | 3; // Log=1, Sample=2, Analyse=3
}

export interface BodyState {
  bodyId: number;
  name: string;
  shortName: string; // name minus system prefix
  isStar: boolean;
  starType?: string;
  planetClass?: string;
  terraformable: boolean;
  landable: boolean;
  distanceLs: number;
  wasDiscovered: boolean; // by anyone, before this scan
  wasMapped: boolean;
  mappedByMe: boolean;
  mappedEfficiently: boolean;
  bioSignals?: BioSignalInfo;
  /** Predicted genuses that could spawn here, from body conditions. */
  bioPrediction?: BioPredictionInfo;
  geoSignals?: number;
  otherSignals?: { type: string; count: number }[];
  value: BodyValueEstimate;
  scannedAt: string;
}

export interface EdsmInterestingBody {
  name: string;
  shortName: string;
  subType: string;
  terraformable: boolean;
  landable: boolean;
  distanceLs: number;
}

export interface ExplorationState {
  systemName: string | null;
  systemAddress: number | null;
  bodyCount: number | null; // from FSSDiscoveryScan honk
  nonBodyCount: number | null;
  scannedCount: number;
  allBodiesFound: boolean;
  fssProgress: number | null; // 0..1 from honk
  bodies: BodyState[]; // sorted by bodyId
  organicInProgress: ExoBioProgress | null;
  organicsCompleted: ExoBioProgress[]; // this system
  systemEstimatedValue: number;
  /** What the scanned bodies would be worth with all of them mapped. */
  systemMappedValue: number;
  /** Signals seen before their body's Scan event arrived (keyed by bodyId). Internal. */
  pendingSignals?: Record<number, { Type: string; Type_Localised?: string; Count: number }[]>;
  edsm: {
    status: 'idle' | 'loading' | 'ok' | 'offline' | 'error';
    knownBodyCount: number | null; // bodies EDSM knows in this system
    /** Notable bodies EDSM already knows about, best-first. */
    interesting: EdsmInterestingBody[];
  };
}

// ── Target / combat ─────────────────────────────────────────────────────────

export interface TargetInfo {
  ship: string;
  scanStage: number;
  pilotName?: string;
  pilotRank?: string;
  faction?: string;
  legalStatus?: string;
  bounty?: number;
  shieldHealth?: number;
  hullHealth?: number;
  subsystem?: string;
  subsystemHealth?: number;
  targetedAt: string;
}

export interface BountyEntry {
  timestamp: string;
  target: string;
  pilotName?: string;
  victimFaction?: string;
  reward: number;
}

export interface TargetState {
  current: TargetInfo | null;
  recentBounties: BountyEntry[]; // newest first, capped
  sessionBountyTotal: number;
  sessionKills: number;
}

// ── Mining ──────────────────────────────────────────────────────────────────

export interface ProspectorResult {
  timestamp: string;
  materials: { name: string; proportion: number }[];
  content: string; // Low/Medium/High
  motherlode?: string;
  remaining: number; // clamped 0..100
}

export interface MiningState {
  lastProspected: ProspectorResult | null;
  refinedCounts: Record<string, number>; // localised commodity -> tons this session
  refinedTotal: number;
  limpetsLaunched: number;
  cargo: { name: string; count: number; stolen: number }[];
  cargoCount: number;
  cargoCapacity: number | null;
}

// ── Session ─────────────────────────────────────────────────────────────────

export interface SessionEarnings {
  bounties: number;
  explorationSold: number;
  exobiologySold: number;
  tradeSales: number;
  tradeProfit: number;
  missions: number;
  vouchers: number;
  total: number;
}

export interface SessionState {
  startedAt: string | null;
  gameMode: string | null;
  earnings: SessionEarnings;
  bodiesScanned: number;
  bodiesMapped: number;
  organicsSampled: number;
  jumps: number;
  distanceJumpedLy: number;
  estimatedUnsoldExploration: number;
  activity: Activity;
}

// ── Commander / overview ────────────────────────────────────────────────────

export interface RouteHop {
  name: string;
  systemAddress: number;
  starClass: string;
  /** Fuel-scoopable main-sequence star (KGBFOAM). */
  scoopable: boolean;
  /** Distance from the previous hop in ly (0 for the first). */
  legLy: number;
}

export interface RankInfo {
  combat: number;
  trade: number;
  explore: number;
  exobiologist?: number;
  soldier?: number;
}

export interface CommanderState {
  name: string | null;
  credits: number | null;
  ship: string | null;
  /** Internal ship type id (e.g. "explorer_nx") to detect ship changes. */
  shipInternal: string | null;
  shipName: string | null;
  shipIdent: string | null;
  systemName: string | null;
  systemAddress: number | null;
  station: string | null;
  body: string | null;
  docked: boolean;
  legalState: string | null;
  fuel: { main: number; reservoir: number; capacity: number | null } | null;
  pips: [number, number, number] | null;
  flags: number;
  ranks: RankInfo | null;
  route: { hops: RouteHop[]; totalLy: number } | null;
  statusStale: boolean;
}

// ── Fleet carrier (Frontier cAPI) ────────────────────────────────────────────

export interface CarrierCommodity {
  /** Internal commodity id, e.g. "platinum". */
  name: string;
  /** Localised display name, e.g. "Platinum". */
  locName: string;
  tons: number;
  /** True if any of the stored tons are stolen. */
  stolen: boolean;
  /** cAPI-reported total value of this stack, if provided. */
  value: number | null;
}

export interface CarrierState {
  /** Whether we hold usable Frontier cAPI tokens. */
  auth: 'unlinked' | 'linked' | 'error';
  callsign: string | null;
  name: string | null;
  /** Stored commodities, aggregated by commodity, tons desc. */
  cargo: CarrierCommodity[];
  totalTons: number;
  /** ISO timestamp of the last successful cAPI fetch. */
  updatedAt: string | null;
  /** Human-readable reason when auth==='error' or a fetch failed. */
  lastError: string | null;
}

export interface AppState {
  exploration: ExplorationState;
  target: TargetState;
  mining: MiningState;
  session: SessionState;
  commander: CommanderState;
  carrier: CarrierState;
}

export type SliceName = keyof AppState;
