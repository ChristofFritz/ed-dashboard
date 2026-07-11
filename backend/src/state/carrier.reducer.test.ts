import { describe, expect, it } from 'vitest';
import type { CarrierState, JournalEvent } from '@ed/shared';
import { carrierReducer } from './carrier.reducer.js';

function base(cargo: CarrierState['cargo'] = []): CarrierState {
  return {
    auth: 'linked',
    callsign: 'X',
    name: 'C',
    cargo,
    totalTons: cargo.reduce((s, c) => s + c.tons, 0),
    updatedAt: null,
    lastError: null,
  };
}

const transfer = (
  Type: string,
  Count: number,
  Direction: 'tocarrier' | 'toship',
): JournalEvent => ({
  timestamp: '2026-07-11T00:00:00Z',
  event: 'CargoTransfer',
  Transfers: [{ Type, Count, Direction }],
});

describe('carrierReducer (optimistic CargoTransfer)', () => {
  it('adds a new commodity moved to the carrier', () => {
    const next = carrierReducer(base(), transfer('thermalcoolingunits', 28, 'tocarrier'));
    expect(next.cargo).toEqual([
      { name: 'thermalcoolingunits', locName: 'thermalcoolingunits', tons: 28, stolen: false, value: null },
    ]);
    expect(next.totalTons).toBe(28);
  });

  it('increments an existing stack (matching case-insensitively)', () => {
    const start = base([{ name: 'Steel', locName: 'Steel', tons: 100, stolen: false, value: null }]);
    const next = carrierReducer(start, transfer('steel', 50, 'tocarrier'));
    expect(next.cargo[0]!.tons).toBe(150);
    expect(next.totalTons).toBe(150);
  });

  it('removes a stack fully unloaded to the ship', () => {
    const start = base([{ name: 'Steel', locName: 'Steel', tons: 30, stolen: false, value: null }]);
    const next = carrierReducer(start, transfer('steel', 30, 'toship'));
    expect(next.cargo).toEqual([]);
    expect(next.totalTons).toBe(0);
  });

  it('does nothing when the cAPI is not linked (no baseline to trust)', () => {
    const start = { ...base(), auth: 'unlinked' as const };
    expect(carrierReducer(start, transfer('steel', 10, 'tocarrier'))).toBe(start);
  });
});
