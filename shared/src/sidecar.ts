/** Types for the sidecar JSON files the game rewrites on change. */

export interface StatusJson {
  timestamp: string;
  event: 'Status';
  Flags: number;
  Flags2?: number;
  Pips?: [number, number, number];
  FireGroup?: number;
  GuiFocus?: number;
  Fuel?: { FuelMain: number; FuelReservoir: number };
  Cargo?: number;
  LegalState?: string;
  Balance?: number;
  Destination?: { System: number; Body: number; Name: string; Name_Localised?: string };
  // On foot / planet fields
  Latitude?: number;
  Longitude?: number;
  Altitude?: number;
  Heading?: number;
  BodyName?: string;
  PlanetRadius?: number;
  Oxygen?: number;
  Health?: number;
  Temperature?: number;
  SelectedWeapon?: string;
  Gravity?: number;
}

/** Bit positions in Status.Flags (Journal Manual). */
export enum StatusFlag {
  Docked = 1 << 0,
  Landed = 1 << 1,
  LandingGearDown = 1 << 2,
  ShieldsUp = 1 << 3,
  Supercruise = 1 << 4,
  FlightAssistOff = 1 << 5,
  HardpointsDeployed = 1 << 6,
  InWing = 1 << 7,
  LightsOn = 1 << 8,
  CargoScoopDeployed = 1 << 9,
  SilentRunning = 1 << 10,
  ScoopingFuel = 1 << 11,
  SrvHandbrake = 1 << 12,
  SrvTurret = 1 << 13,
  SrvUnderShip = 1 << 14,
  SrvDriveAssist = 1 << 15,
  FsdMassLocked = 1 << 16,
  FsdCharging = 1 << 17,
  FsdCooldown = 1 << 18,
  LowFuel = 1 << 19,
  OverHeating = 1 << 20,
  HasLatLong = 1 << 21,
  IsInDanger = 1 << 22,
  BeingInterdicted = 1 << 23,
  InMainShip = 1 << 24,
  InFighter = 1 << 25,
  InSRV = 1 << 26,
  HudInAnalysisMode = 1 << 27,
  NightVision = 1 << 28,
  AltitudeFromAverageRadius = 1 << 29,
  FsdJump = 1 << 30,
  SrvHighBeam = 1 << 31,
}

export interface CargoJson {
  timestamp: string;
  event: 'Cargo';
  Vessel: string;
  Count: number;
  Inventory?: { Name: string; Name_Localised?: string; Count: number; Stolen: number }[];
}

export interface MarketJson {
  timestamp: string;
  event: 'Market';
  MarketID: number;
  StationName?: string;
  StationType?: string;
  StarSystem?: string;
  Items?: {
    id: number;
    Name: string; // "$steel_name;"
    Name_Localised?: string;
    Category?: string;
    BuyPrice?: number;
    Stock?: number;
    Demand?: number;
    StockBracket?: number;
  }[];
}

export interface NavRouteJson {
  timestamp: string;
  event: 'NavRoute' | 'NavRouteClear';
  Route?: {
    StarSystem: string;
    SystemAddress: number;
    StarPos: [number, number, number];
    StarClass: string;
  }[];
}
