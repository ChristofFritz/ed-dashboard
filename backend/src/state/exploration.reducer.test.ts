import { describe, expect, it } from 'vitest';
import type { JournalEvent } from '@ed/shared';
import { explorationReducer } from './exploration.reducer.js';
import { initialExploration } from './initial.js';

function replay(events: object[]) {
  let slice = initialExploration();
  for (const e of events) slice = explorationReducer(slice, e as JournalEvent);
  return slice;
}

const jump = {
  event: 'FSDJump',
  timestamp: '2026-01-01T00:00:00Z',
  StarSystem: 'Test System',
  SystemAddress: 42,
  StarPos: [0, 0, 0],
  JumpDist: 10,
  FuelUsed: 1,
  FuelLevel: 15,
};

describe('explorationReducer', () => {
  it('resets on jump and tracks FSS progress', () => {
    const slice = replay([
      jump,
      {
        event: 'FSSDiscoveryScan',
        timestamp: '2026-01-01T00:01:00Z',
        Progress: 0.28,
        BodyCount: 12,
        NonBodyCount: 3,
        SystemName: 'Test System',
        SystemAddress: 42,
      },
    ]);
    expect(slice.systemName).toBe('Test System');
    expect(slice.bodyCount).toBe(12);
    expect(slice.fssProgress).toBe(0.28);
    expect(slice.allBodiesFound).toBe(false);
  });

  it('applies signals that arrive before the Scan (FSS ordering)', () => {
    const slice = replay([
      jump,
      {
        event: 'FSSBodySignals',
        timestamp: '2026-01-01T00:02:00Z',
        BodyName: 'Test System 4 a',
        BodyID: 8,
        SystemAddress: 42,
        Signals: [{ Type: '$SAA_SignalType_Biological;', Type_Localised: 'Biological', Count: 5 }],
      },
      {
        event: 'Scan',
        timestamp: '2026-01-01T00:02:01Z',
        ScanType: 'Detailed',
        BodyName: 'Test System 4 a',
        BodyID: 8,
        StarSystem: 'Test System',
        SystemAddress: 42,
        DistanceFromArrivalLS: 1000,
        WasDiscovered: false,
        WasMapped: false,
        PlanetClass: 'Rocky body',
        MassEM: 0.01,
        Landable: true,
      },
    ]);
    expect(slice.bodies).toHaveLength(1);
    expect(slice.bodies[0]!.bioSignals?.count).toBe(5);
    expect(slice.pendingSignals?.[8]).toBeUndefined();
  });

  it('tracks mapping and exobio sample progression', () => {
    const scan = {
      event: 'Scan',
      timestamp: '2026-01-01T00:03:00Z',
      ScanType: 'Detailed',
      BodyName: 'Test System 5',
      BodyID: 9,
      StarSystem: 'Test System',
      SystemAddress: 42,
      DistanceFromArrivalLS: 500,
      WasDiscovered: false,
      WasMapped: false,
      PlanetClass: 'Water world',
      TerraformState: 'Terraformable',
      MassEM: 1,
    };
    const organic = (scanType: string) => ({
      event: 'ScanOrganic',
      timestamp: '2026-01-01T00:05:00Z',
      ScanType: scanType,
      Genus: '$Codex_Ent_Bacterial_Genus_Name;',
      Genus_Localised: 'Bacterium',
      Species: '$Codex_Ent_Bacterial_05_Name;',
      Species_Localised: 'Bacterium Vesicula',
      SystemAddress: 42,
      Body: 9,
    });

    let slice = replay([
      jump,
      scan,
      {
        event: 'SAAScanComplete',
        timestamp: '2026-01-01T00:04:00Z',
        BodyName: 'Test System 5',
        BodyID: 9,
        SystemAddress: 42,
        ProbesUsed: 6,
        EfficiencyTarget: 8,
      },
      organic('Log'),
    ]);
    expect(slice.bodies[0]!.mappedByMe).toBe(true);
    expect(slice.bodies[0]!.mappedEfficiently).toBe(true);
    expect(slice.organicInProgress?.samples).toBe(1);
    expect(slice.systemEstimatedValue).toBe(slice.bodies[0]!.value.mappedValue);

    slice = explorationReducer(slice, organic('Sample') as JournalEvent);
    expect(slice.organicInProgress?.samples).toBe(2);
    slice = explorationReducer(slice, organic('Analyse') as JournalEvent);
    expect(slice.organicInProgress).toBeNull();
    expect(slice.organicsCompleted).toHaveLength(1);
    expect(slice.organicsCompleted[0]!.species).toBe('Bacterium Vesicula');
  });
});
