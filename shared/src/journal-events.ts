/**
 * Typed subset of Elite Dangerous journal events (Journal Manual v39 era).
 * Unknown events fall through as UnknownJournalEvent. All timestamps are UTC ISO strings.
 */

export interface JournalEventBase {
  timestamp: string;
  event: string;
}

/** Fields that may carry a localised variant. Use loc() to read them. */
export interface Localised {
  [key: string]: unknown;
}

/** Returns the localised variant of a field if present, else the raw value, stripping $...; tokens. */
export function loc(o: object, field: string): string {
  const obj = o as Record<string, unknown>;
  const localised = obj[`${field}_Localised`];
  if (typeof localised === 'string') return localised;
  const raw = obj[field];
  if (typeof raw !== 'string') return '';
  // Strip symbol tokens like "$AsteroidMaterialContent_Medium;"
  const m = raw.match(/^\$(.+);$/);
  return m ? m[1]!.replace(/_/g, ' ') : raw;
}

// ── Startup / meta ──────────────────────────────────────────────────────────

export interface FileheaderEvent extends JournalEventBase {
  event: 'Fileheader';
  part: number;
  language: string;
  gameversion: string;
  build: string;
  Odyssey?: boolean;
}

export interface CommanderEvent extends JournalEventBase {
  event: 'Commander';
  FID: string;
  Name: string;
}

export interface LoadGameEvent extends JournalEventBase {
  event: 'LoadGame';
  FID: string;
  Commander: string;
  Horizons?: boolean;
  Odyssey?: boolean;
  Ship?: string;
  Ship_Localised?: string;
  ShipID?: number;
  ShipName?: string;
  ShipIdent?: string;
  FuelLevel?: number;
  FuelCapacity?: number;
  GameMode?: string;
  Group?: string;
  Credits: number;
  Loan?: number;
}

export interface RankEvent extends JournalEventBase {
  event: 'Rank';
  Combat: number;
  Trade: number;
  Explore: number;
  Soldier?: number;
  Exobiologist?: number;
  Empire: number;
  Federation: number;
  CQC: number;
}

export interface ProgressEvent extends JournalEventBase {
  event: 'Progress';
  Combat: number;
  Trade: number;
  Explore: number;
  Soldier?: number;
  Exobiologist?: number;
  Empire: number;
  Federation: number;
  CQC: number;
}

export interface StatisticsEvent extends JournalEventBase {
  event: 'Statistics';
  [category: string]: unknown;
}

export interface ShutdownEvent extends JournalEventBase {
  event: 'Shutdown';
}

// ── Location / travel ───────────────────────────────────────────────────────

export interface StarPosLocation {
  StarSystem: string;
  SystemAddress: number;
  StarPos: [number, number, number];
  Body?: string;
  BodyID?: number;
  BodyType?: string;
  Docked?: boolean;
  StationName?: string;
  StationType?: string;
}

export interface LocationEvent extends JournalEventBase, StarPosLocation {
  event: 'Location';
}

export interface FSDJumpEvent extends JournalEventBase, StarPosLocation {
  event: 'FSDJump';
  JumpDist: number;
  FuelUsed: number;
  FuelLevel: number;
}

export interface FSDTargetEvent extends JournalEventBase {
  event: 'FSDTarget';
  Name: string;
  SystemAddress: number;
  StarClass?: string;
  RemainingJumpsInRoute?: number;
}

export interface StartJumpEvent extends JournalEventBase {
  event: 'StartJump';
  JumpType: 'Hyperspace' | 'Supercruise';
  StarSystem?: string;
  SystemAddress?: number;
  StarClass?: string;
  Taxi?: boolean;
}

export interface SupercruiseEntryEvent extends JournalEventBase {
  event: 'SupercruiseEntry';
  StarSystem: string;
  SystemAddress: number;
}

export interface SupercruiseExitEvent extends JournalEventBase {
  event: 'SupercruiseExit';
  StarSystem: string;
  SystemAddress: number;
  Body?: string;
  BodyID?: number;
  BodyType?: string;
}

export interface DockedEvent extends JournalEventBase {
  event: 'Docked';
  StationName: string;
  StationType?: string;
  StarSystem: string;
  SystemAddress: number;
  MarketID?: number;
  StationFaction?: { Name: string };
  DistFromStarLS?: number;
}

export interface UndockedEvent extends JournalEventBase {
  event: 'Undocked';
  StationName: string;
  StationType?: string;
  MarketID?: number;
}

export interface ApproachBodyEvent extends JournalEventBase {
  event: 'ApproachBody';
  StarSystem: string;
  SystemAddress: number;
  Body: string;
  BodyID: number;
}

export interface LeaveBodyEvent extends JournalEventBase {
  event: 'LeaveBody';
  StarSystem: string;
  SystemAddress: number;
  Body: string;
  BodyID: number;
}

export interface TouchdownEvent extends JournalEventBase {
  event: 'Touchdown';
  StarSystem?: string;
  SystemAddress?: number;
  Body?: string;
  BodyID?: number;
  OnPlanet?: boolean;
  Latitude?: number;
  Longitude?: number;
}

export interface LiftoffEvent extends JournalEventBase {
  event: 'Liftoff';
  StarSystem?: string;
  SystemAddress?: number;
  Body?: string;
  BodyID?: number;
}

export interface NavRouteEvent extends JournalEventBase {
  event: 'NavRoute';
}

export interface NavRouteClearEvent extends JournalEventBase {
  event: 'NavRouteClear';
}

// ── Exploration ─────────────────────────────────────────────────────────────

export interface FSSDiscoveryScanEvent extends JournalEventBase {
  event: 'FSSDiscoveryScan';
  Progress: number;
  BodyCount: number;
  NonBodyCount: number;
  SystemName: string;
  SystemAddress: number;
}

export interface FSSAllBodiesFoundEvent extends JournalEventBase {
  event: 'FSSAllBodiesFound';
  SystemName: string;
  SystemAddress: number;
  Count: number;
}

export interface BodySignal {
  Type: string;
  Type_Localised?: string;
  Count: number;
}

export interface FSSBodySignalsEvent extends JournalEventBase {
  event: 'FSSBodySignals';
  BodyName: string;
  BodyID: number;
  SystemAddress: number;
  Signals: BodySignal[];
}

export interface SAASignalsFoundEvent extends JournalEventBase {
  event: 'SAASignalsFound';
  BodyName: string;
  BodyID: number;
  SystemAddress: number;
  Signals: BodySignal[];
  Genuses?: { Genus: string; Genus_Localised?: string }[];
}

export interface SAAScanCompleteEvent extends JournalEventBase {
  event: 'SAAScanComplete';
  BodyName: string;
  BodyID: number;
  SystemAddress: number;
  ProbesUsed: number;
  EfficiencyTarget: number;
}

export interface FSSSignalDiscoveredEvent extends JournalEventBase {
  event: 'FSSSignalDiscovered';
  SystemAddress: number;
  SignalName: string;
  SignalName_Localised?: string;
  SignalType?: string;
  IsStation?: boolean;
  USSType?: string;
  USSType_Localised?: string;
  ThreatLevel?: number;
  TimeRemaining?: number;
}

export interface ScanParent {
  [type: string]: number;
}

export interface RingInfo {
  Name: string;
  RingClass: string;
  MassMT: number;
  InnerRad: number;
  OuterRad: number;
}

export interface ScanEvent extends JournalEventBase {
  event: 'Scan';
  ScanType: 'AutoScan' | 'Basic' | 'Detailed' | 'NavBeacon' | 'NavBeaconDetail';
  BodyName: string;
  BodyID: number;
  Parents?: ScanParent[];
  StarSystem: string;
  SystemAddress: number;
  DistanceFromArrivalLS: number;
  WasDiscovered: boolean;
  WasMapped: boolean;
  WasFootfalled?: boolean;
  // Stars
  StarType?: string;
  Subclass?: number;
  StellarMass?: number;
  AbsoluteMagnitude?: number;
  Age_MY?: number;
  Luminosity?: string;
  // Planets
  PlanetClass?: string;
  TerraformState?: string;
  Atmosphere?: string;
  AtmosphereType?: string;
  Volcanism?: string;
  MassEM?: number;
  Radius?: number;
  SurfaceGravity?: number;
  SurfaceTemperature?: number;
  SurfacePressure?: number;
  Landable?: boolean;
  Composition?: { Ice: number; Rock: number; Metal: number };
  // Orbit
  SemiMajorAxis?: number;
  Eccentricity?: number;
  OrbitalPeriod?: number;
  RotationPeriod?: number;
  AxialTilt?: number;
  TidalLock?: boolean;
  Rings?: RingInfo[];
  ReserveLevel?: string;
}

export interface ScanBaryCentreEvent extends JournalEventBase {
  event: 'ScanBaryCentre';
  StarSystem: string;
  SystemAddress: number;
  BodyID: number;
}

export interface ScanOrganicEvent extends JournalEventBase {
  event: 'ScanOrganic';
  ScanType: 'Log' | 'Sample' | 'Analyse';
  Genus: string;
  Genus_Localised?: string;
  Species: string;
  Species_Localised?: string;
  Variant?: string;
  Variant_Localised?: string;
  WasLogged?: boolean;
  SystemAddress: number;
  Body: number;
}

export interface CodexEntryEvent extends JournalEventBase {
  event: 'CodexEntry';
  EntryID: number;
  Name: string;
  Name_Localised?: string;
  Category: string;
  Category_Localised?: string;
  SubCategory: string;
  SubCategory_Localised?: string;
  Region: string;
  Region_Localised?: string;
  System: string;
  SystemAddress: number;
  BodyID?: number;
  IsNewEntry?: boolean;
  VoucherAmount?: number;
}

export interface MultiSellExplorationDataEvent extends JournalEventBase {
  event: 'MultiSellExplorationData';
  Discovered: { SystemName: string; NumBodies: number }[];
  BaseValue: number;
  Bonus: number;
  TotalEarnings: number;
}

export interface SellExplorationDataEvent extends JournalEventBase {
  event: 'SellExplorationData';
  Systems: string[];
  Discovered: string[];
  BaseValue: number;
  Bonus: number;
  TotalEarnings: number;
}

export interface SellOrganicDataEvent extends JournalEventBase {
  event: 'SellOrganicData';
  MarketID: number;
  BioData: {
    Genus: string;
    Genus_Localised?: string;
    Species: string;
    Species_Localised?: string;
    Variant?: string;
    Variant_Localised?: string;
    Value: number;
    Bonus: number;
  }[];
}

// ── Combat / targeting ──────────────────────────────────────────────────────

export interface ShipTargetedEvent extends JournalEventBase {
  event: 'ShipTargeted';
  TargetLocked: boolean;
  Ship?: string;
  Ship_Localised?: string;
  ScanStage?: number;
  PilotName?: string;
  PilotName_Localised?: string;
  PilotRank?: string;
  ShieldHealth?: number;
  HullHealth?: number;
  Faction?: string;
  LegalStatus?: string;
  Bounty?: number;
  SubsystemHealth?: number;
  Subsystem?: string;
  Subsystem_Localised?: string;
  Power?: string;
  SquadronID?: string;
}

export interface BountyEvent extends JournalEventBase {
  event: 'Bounty';
  Rewards?: { Faction: string; Reward: number }[];
  PilotName?: string;
  PilotName_Localised?: string;
  Target?: string;
  Target_Localised?: string;
  TotalReward: number;
  VictimFaction?: string;
  SharedWithOthers?: number;
}

export interface UnderAttackEvent extends JournalEventBase {
  event: 'UnderAttack';
  Target?: string;
}

export interface HullDamageEvent extends JournalEventBase {
  event: 'HullDamage';
  Health: number;
  PlayerPilot: boolean;
  Fighter?: boolean;
}

export interface ShieldStateEvent extends JournalEventBase {
  event: 'ShieldState';
  ShieldsUp: boolean;
}

export interface DiedEvent extends JournalEventBase {
  event: 'Died';
  KillerName?: string;
  KillerName_Localised?: string;
  KillerShip?: string;
  KillerRank?: string;
}

export interface RedeemVoucherEvent extends JournalEventBase {
  event: 'RedeemVoucher';
  Type: string;
  Amount: number;
  Factions?: { Faction: string; Amount: number }[];
  BrokerPercentage?: number;
}

// ── Mining ──────────────────────────────────────────────────────────────────

export interface ProspectedAsteroidEvent extends JournalEventBase {
  event: 'ProspectedAsteroid';
  Materials: { Name: string; Name_Localised?: string; Proportion: number }[];
  Content: string;
  Content_Localised?: string;
  MotherlodeMaterial?: string;
  MotherlodeMaterial_Localised?: string;
  Remaining: number;
}

export interface MiningRefinedEvent extends JournalEventBase {
  event: 'MiningRefined';
  Type: string;
  Type_Localised?: string;
}

export interface LaunchDroneEvent extends JournalEventBase {
  event: 'LaunchDrone';
  Type: 'Prospector' | 'Collection' | 'Hatchbreaker' | 'FuelTransfer' | 'Repair' | 'Research' | 'Decontamination';
}

export interface CargoEvent extends JournalEventBase {
  event: 'Cargo';
  Vessel: 'Ship' | 'SRV';
  Count: number;
  Inventory?: { Name: string; Name_Localised?: string; Count: number; Stolen: number }[];
}

// ── Trade / missions ────────────────────────────────────────────────────────

export interface MarketSellEvent extends JournalEventBase {
  event: 'MarketSell';
  MarketID: number;
  Type: string;
  Type_Localised?: string;
  Count: number;
  SellPrice: number;
  TotalSale: number;
  AvgPricePaid: number;
}

export interface MarketBuyEvent extends JournalEventBase {
  event: 'MarketBuy';
  MarketID: number;
  Type: string;
  Type_Localised?: string;
  Count: number;
  BuyPrice: number;
  TotalCost: number;
}

export interface MissionCompletedEvent extends JournalEventBase {
  event: 'MissionCompleted';
  Faction: string;
  Name: string;
  LocalisedName?: string;
  MissionID: number;
  Reward?: number;
  Donation?: string;
  Donated?: number;
}

export interface MissionAcceptedEvent extends JournalEventBase {
  event: 'MissionAccepted';
  Faction: string;
  Name: string;
  LocalisedName?: string;
  MissionID: number;
  Reward?: number;
  Expiry?: string;
}

// ── Fuel / misc ─────────────────────────────────────────────────────────────

export interface FuelScoopEvent extends JournalEventBase {
  event: 'FuelScoop';
  Scooped: number;
  Total: number;
}

export interface RefuelAllEvent extends JournalEventBase {
  event: 'RefuelAll';
  Cost: number;
  Amount: number;
}

export interface LoadoutEvent extends JournalEventBase {
  event: 'Loadout';
  Ship: string;
  ShipID: number;
  ShipName: string;
  ShipIdent: string;
  HullValue?: number;
  ModulesValue?: number;
  Rebuy?: number;
  MaxJumpRange?: number;
  CargoCapacity?: number;
  UnladenMass?: number;
  FuelCapacity?: { Main: number; Reserve: number };
  Modules?: unknown[];
}

/**
 * Events we don't model. Kept OUT of the JournalEvent union so switch/case
 * narrowing on `event` works; at runtime unknown events simply fall through
 * every reducer's default branch.
 */
export interface ShipyardSwapEvent extends JournalEventBase {
  event: 'ShipyardSwap';
  ShipType: string;
  ShipType_Localised?: string;
  ShipID: number;
  StoreOldShip?: string;
  StoreShipID?: number;
  MarketID?: number;
}

export interface ShipyardNewEvent extends JournalEventBase {
  event: 'ShipyardNew';
  ShipType: string;
  ShipType_Localised?: string;
  NewShipID: number;
}

export interface UnknownJournalEvent extends JournalEventBase {
  [key: string]: unknown;
}

export type JournalEvent =
  | FileheaderEvent
  | CommanderEvent
  | LoadGameEvent
  | RankEvent
  | ProgressEvent
  | StatisticsEvent
  | ShutdownEvent
  | LocationEvent
  | FSDJumpEvent
  | FSDTargetEvent
  | StartJumpEvent
  | SupercruiseEntryEvent
  | SupercruiseExitEvent
  | DockedEvent
  | UndockedEvent
  | ApproachBodyEvent
  | LeaveBodyEvent
  | TouchdownEvent
  | LiftoffEvent
  | NavRouteEvent
  | NavRouteClearEvent
  | FSSDiscoveryScanEvent
  | FSSAllBodiesFoundEvent
  | FSSBodySignalsEvent
  | SAASignalsFoundEvent
  | SAAScanCompleteEvent
  | FSSSignalDiscoveredEvent
  | ScanEvent
  | ScanBaryCentreEvent
  | ScanOrganicEvent
  | CodexEntryEvent
  | MultiSellExplorationDataEvent
  | SellExplorationDataEvent
  | SellOrganicDataEvent
  | ShipTargetedEvent
  | BountyEvent
  | UnderAttackEvent
  | HullDamageEvent
  | ShieldStateEvent
  | DiedEvent
  | RedeemVoucherEvent
  | ProspectedAsteroidEvent
  | MiningRefinedEvent
  | LaunchDroneEvent
  | CargoEvent
  | MarketSellEvent
  | MarketBuyEvent
  | MissionCompletedEvent
  | MissionAcceptedEvent
  | FuelScoopEvent
  | RefuelAllEvent
  | LoadoutEvent
  | ShipyardSwapEvent
  | ShipyardNewEvent;
