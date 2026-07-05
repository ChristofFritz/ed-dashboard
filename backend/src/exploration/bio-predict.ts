import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { ScanEvent } from '@ed/shared';

/**
 * Exobiology spawn predictor. Rules are derived from the community-maintained
 * EDMC-BioScan dataset (github.com/Silarn/EDMC-BioScan), which reverse-engineers
 * FDev's spawn conditions from observed samples. We match on the strong signals
 * — atmosphere type, body class, gravity, temperature — and intentionally skip
 * region/volcanism/pressure narrowing, so this predicts the *genus* level
 * ("what could live here"), not the exact species. Values are per-colony.
 */

interface SpeciesRule {
  name: string;
  value: number;
  atmosphere?: string[];
  body_type?: string[];
  min_gravity?: number;
  max_gravity?: number;
  min_temperature?: number;
  max_temperature?: number;
  volcanism?: unknown;
}

interface GenusEntry {
  genus: string;
  species: SpeciesRule[];
}

const G = 9.80665; // journal SurfaceGravity is m/s²; rules use G

// Genuses gated on galactic-region / nebula / star proximity we can't derive
// from a Scan event. Predicting them from conditions alone is unreliable, so
// we omit them rather than show false positives.
const REGION_LOCKED = new Set([
  'Crystalline Shards',
  'Brain Tree',
  'Anemone',
  'Sinuous Tubers',
  'Bark Mounds',
]);

const RULES: Record<string, GenusEntry> = JSON.parse(
  readFileSync(path.join(import.meta.dirname, 'bio-rules.json'), 'utf8'),
);

export interface BioCandidate {
  genus: string;
  /** Cheapest matching species — the guaranteed floor if this genus is present. */
  minValue: number;
  /** Most valuable matching species. */
  maxValue: number;
}

export interface BioPrediction {
  candidates: BioCandidate[];
  /** Highest single-species value across all candidate genuses. */
  maxValue: number;
}

function ruleMatches(scan: ScanEvent, r: SpeciesRule): boolean {
  const atmo = scan.AtmosphereType;
  if (r.atmosphere && (!atmo || !r.atmosphere.includes(atmo))) return false;
  if (r.body_type && (!scan.PlanetClass || !r.body_type.includes(scan.PlanetClass))) return false;

  if (scan.SurfaceGravity !== undefined) {
    const g = scan.SurfaceGravity / G;
    if (r.min_gravity !== undefined && g < r.min_gravity - 0.01) return false;
    if (r.max_gravity !== undefined && g > r.max_gravity + 0.01) return false;
  }
  if (scan.SurfaceTemperature !== undefined) {
    const t = scan.SurfaceTemperature;
    if (r.min_temperature !== undefined && t < r.min_temperature - 1) return false;
    if (r.max_temperature !== undefined && t > r.max_temperature + 1) return false;
  }
  return true;
}

/** Predict which biological genuses could occur on a scanned body. */
export function predictBio(scan: ScanEvent): BioPrediction {
  // Never on stars/gas giants.
  if (scan.StarType || !scan.PlanetClass) return { candidates: [], maxValue: 0 };
  // Airless-body organics (Brain Trees, Anemones, Crystalline Shards, Bark Mounds)
  // are gated on nebula/star proximity we can't derive from a Scan, so predicting
  // them everywhere is noise. Restrict to atmospheric bodies, where genus presence
  // is genuinely determined by the conditions we match on.
  if (!scan.AtmosphereType || scan.AtmosphereType === 'None') return { candidates: [], maxValue: 0 };

  const candidates: BioCandidate[] = [];
  for (const entry of Object.values(RULES)) {
    if (REGION_LOCKED.has(entry.genus)) continue;
    const matched = entry.species.filter((r) => ruleMatches(scan, r));
    if (matched.length === 0) continue;
    const values = matched.map((m) => m.value);
    candidates.push({
      genus: entry.genus,
      minValue: Math.min(...values),
      maxValue: Math.max(...values),
    });
  }
  candidates.sort((a, b) => b.maxValue - a.maxValue);
  return { candidates, maxValue: candidates[0]?.maxValue ?? 0 };
}
