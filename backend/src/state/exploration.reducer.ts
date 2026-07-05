import type {
  BodyState,
  ExplorationState,
  JournalEvent,
  SAASignalsFoundEvent,
  ScanEvent,
} from '@ed/shared';
import { loc } from '@ed/shared';
import { valueFromScan } from '../exploration/body-value.js';
import { predictBio } from '../exploration/bio-predict.js';
import { initialExploration } from './initial.js';

function shortName(bodyName: string, systemName: string | null): string {
  if (!systemName) return bodyName;
  if (bodyName === systemName) return '★';
  return bodyName.startsWith(systemName) ? bodyName.slice(systemName.length).trim() : bodyName;
}

function upsertBody(slice: ExplorationState, body: BodyState): ExplorationState {
  const bodies = slice.bodies.filter((b) => b.bodyId !== body.bodyId);
  bodies.push(body);
  bodies.sort((a, b) => a.bodyId - b.bodyId);
  const systemEstimatedValue = bodies.reduce(
    (acc, b) => acc + (b.mappedByMe ? b.value.mappedValue : b.value.scanValue),
    0,
  );
  const systemMappedValue = bodies.reduce((acc, b) => acc + b.value.mappedValue, 0);
  return { ...slice, bodies, scannedCount: bodies.length, systemEstimatedValue, systemMappedValue };
}

function bioPredictionOrUndefined(e: ScanEvent) {
  const prediction = predictBio(e);
  return prediction.candidates.length > 0 ? prediction : undefined;
}

function reduceScan(slice: ExplorationState, e: ScanEvent): ExplorationState {
  // Belt clusters and barycentres have neither StarType nor PlanetClass — skip.
  if (!e.StarType && !e.PlanetClass) return slice;
  const existing = slice.bodies.find((b) => b.bodyId === e.BodyID);
  const body: BodyState = {
    bodyId: e.BodyID,
    name: e.BodyName,
    shortName: shortName(e.BodyName, e.StarSystem),
    isStar: !!e.StarType,
    starType: e.StarType,
    planetClass: e.PlanetClass,
    terraformable: !!e.TerraformState,
    landable: e.Landable ?? false,
    distanceLs: e.DistanceFromArrivalLS,
    wasDiscovered: e.WasDiscovered,
    wasMapped: e.WasMapped,
    mappedByMe: existing?.mappedByMe ?? false,
    mappedEfficiently: existing?.mappedEfficiently ?? false,
    bioSignals: existing?.bioSignals,
    bioPrediction: bioPredictionOrUndefined(e),
    geoSignals: existing?.geoSignals,
    otherSignals: existing?.otherSignals,
    value: valueFromScan(e),
    scannedAt: e.timestamp,
  };
  const next = upsertBody(slice, body);
  // Apply any signals that arrived before this Scan.
  const pending = slice.pendingSignals?.[e.BodyID];
  if (pending) {
    const { [e.BodyID]: _, ...rest } = next.pendingSignals ?? {};
    return reduceSignals({ ...next, pendingSignals: rest }, e.BodyID, pending);
  }
  return next;
}

function reduceSignals(
  slice: ExplorationState,
  bodyId: number,
  signals: { Type: string; Type_Localised?: string; Count: number }[],
  genuses?: { Genus: string; Genus_Localised?: string }[],
): ExplorationState {
  const existing = slice.bodies.find((b) => b.bodyId === bodyId);
  if (!existing) {
    // Signals arrived before the body's Scan; stash them until it lands.
    return {
      ...slice,
      pendingSignals: { ...slice.pendingSignals, [bodyId]: signals },
    };
  }
  let bio = existing.bioSignals;
  let geo = existing.geoSignals;
  const other: { type: string; count: number }[] = [];
  for (const s of signals) {
    const type = loc(s, 'Type');
    if (type === 'Biological') {
      bio = { count: s.Count, genuses: bio?.genuses ?? [] };
    } else if (type === 'Geological') {
      geo = s.Count;
    } else {
      other.push({ type, count: s.Count });
    }
  }
  if (genuses?.length && bio) {
    bio = { ...bio, genuses: genuses.map((g) => loc(g, 'Genus')) };
  }
  return upsertBody(slice, {
    ...existing,
    bioSignals: bio,
    geoSignals: geo,
    otherSignals: other.length ? other : existing.otherSignals,
  });
}

export function explorationReducer(slice: ExplorationState, e: JournalEvent): ExplorationState {
  switch (e.event) {
    case 'FSDJump':
      return { ...initialExploration(), systemName: e.StarSystem, systemAddress: e.SystemAddress };
    case 'Location':
      if (e.SystemAddress === slice.systemAddress) return slice;
      return { ...initialExploration(), systemName: e.StarSystem, systemAddress: e.SystemAddress };
    case 'FSSDiscoveryScan':
      return {
        ...slice,
        systemName: slice.systemName ?? e.SystemName,
        systemAddress: slice.systemAddress ?? e.SystemAddress,
        bodyCount: e.BodyCount,
        nonBodyCount: e.NonBodyCount,
        fssProgress: e.Progress,
      };
    case 'FSSAllBodiesFound':
      return { ...slice, allBodiesFound: true, bodyCount: e.Count, fssProgress: 1 };
    case 'Scan':
      return reduceScan(slice, e);
    case 'FSSBodySignals':
      return reduceSignals(slice, e.BodyID, e.Signals);
    case 'SAASignalsFound': {
      const ev = e as SAASignalsFoundEvent;
      return reduceSignals(slice, ev.BodyID, ev.Signals, ev.Genuses);
    }
    case 'SAAScanComplete': {
      const existing = slice.bodies.find((b) => b.bodyId === e.BodyID);
      if (!existing) return slice;
      return upsertBody(slice, {
        ...existing,
        mappedByMe: true,
        mappedEfficiently: e.ProbesUsed <= e.EfficiencyTarget,
      });
    }
    case 'ScanOrganic': {
      const samples = e.ScanType === 'Log' ? 1 : e.ScanType === 'Sample' ? 2 : 3;
      const progress = {
        bodyId: e.Body,
        genus: loc(e, 'Genus'),
        species: loc(e, 'Species'),
        variant: e.Variant ? loc(e, 'Variant') : undefined,
        samples: samples as 1 | 2 | 3,
      };
      if (samples === 3) {
        return {
          ...slice,
          organicInProgress: null,
          organicsCompleted: [...slice.organicsCompleted, progress],
        };
      }
      return { ...slice, organicInProgress: progress };
    }
    default:
      return slice;
  }
}
