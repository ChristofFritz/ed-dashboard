import type { BodyValueEstimate, ScanEvent } from '@ed/shared';

/**
 * Community-standard exploration value formulas (MattG / EDSM / EDDiscovery).
 * value = max(500, (k + k*q*mass^0.2) * mappingMultiplier) * firstDiscoveryMultiplier
 */
const Q = 0.56591828;

const FIRST_DISCOVERY_MULT = 2.6;
const MAPPED_MULT = 3.3333333333;
const MAPPED_FIRST_MAPPED_MULT = 8.0956;
const MAPPED_FIRST_BOTH_MULT = 3.699622554; // first discovered AND first mapped (×2.6 applies on top)
const EFFICIENCY_MULT = 1.25;

/** k values by PlanetClass; [base, terraformableBonus] */
const PLANET_K: Record<string, [number, number]> = {
  'Metal rich body': [21790, 0],
  'Ammonia world': [96932, 0],
  'Sudarsky class I gas giant': [1656, 0],
  'Sudarsky class II gas giant': [9654, 100677],
  'High metal content body': [9654, 100677],
  'Water world': [64831, 116295],
  'Earth-like body': [64831, 116295], // terraform bonus always applies to ELWs
};
const PLANET_K_DEFAULT: [number, number] = [300, 93328];

function starK(starType: string): number {
  const t = starType.toUpperCase();
  if (t.startsWith('D')) return 14057; // white dwarfs
  if (t === 'N' || t === 'H' || t === 'SUPERMASSIVEBLACKHOLE') return 22628; // neutron stars & black holes
  return 1200;
}

export interface BodyValueInput {
  starType?: string;
  planetClass?: string;
  /** MassEM for planets, StellarMass for stars */
  mass: number;
  terraformable: boolean;
  /** WasDiscovered=false ⇒ we are the first discoverer */
  firstDiscovered: boolean;
  /** WasMapped=false ⇒ mapping it makes us first mapper */
  firstMapped: boolean;
}

function planetBaseValue(input: BodyValueInput): number {
  const [k, tfBonus] = PLANET_K[input.planetClass ?? ''] ?? PLANET_K_DEFAULT;
  const isElw = input.planetClass === 'Earth-like body';
  const effectiveK = k + (input.terraformable || isElw ? tfBonus : 0);
  return effectiveK + effectiveK * Q * Math.pow(Math.max(input.mass, 0), 0.2);
}

function mappingMultiplier(input: BodyValueInput, efficiently: boolean): number {
  let mult: number;
  if (input.firstDiscovered && input.firstMapped) mult = MAPPED_FIRST_BOTH_MULT;
  else if (input.firstMapped) mult = MAPPED_FIRST_MAPPED_MULT;
  else mult = MAPPED_MULT;
  return efficiently ? mult * EFFICIENCY_MULT : mult;
}

export function estimateBodyValue(input: BodyValueInput): BodyValueEstimate {
  if (input.starType) {
    const k = starK(input.starType);
    const base = k + (input.mass * k) / 66.25;
    const scanValue = Math.round(base * (input.firstDiscovered ? FIRST_DISCOVERY_MULT : 1));
    // Stars cannot be mapped.
    return { scanValue, mappedValue: scanValue, maxValue: scanValue };
  }

  const base = planetBaseValue(input);
  const fd = input.firstDiscovered ? FIRST_DISCOVERY_MULT : 1;
  const scanValue = Math.round(Math.max(500, base) * fd);
  const mappedValue = Math.round(Math.max(500, base * mappingMultiplier(input, false)) * fd);
  const maxValue = Math.round(Math.max(500, base * mappingMultiplier(input, true)) * fd);
  return { scanValue, mappedValue, maxValue };
}

/** Convenience: build the input straight from a Scan event. */
export function valueFromScan(scan: ScanEvent): BodyValueEstimate {
  return estimateBodyValue({
    starType: scan.StarType,
    planetClass: scan.PlanetClass,
    mass: scan.StarType ? (scan.StellarMass ?? 0) : (scan.MassEM ?? 0),
    terraformable: !!scan.TerraformState && scan.TerraformState !== '',
    firstDiscovered: scan.WasDiscovered === false,
    firstMapped: scan.WasMapped === false,
  });
}
