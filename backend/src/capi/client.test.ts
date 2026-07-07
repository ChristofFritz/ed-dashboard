import { describe, expect, it } from 'vitest';
import { parseCargo } from './client.js';

describe('parseCargo', () => {
  it('merges stacks of the same commodity and sums tons/value', () => {
    const out = parseCargo([
      { commodity: 'platinum', locName: 'Platinum', qty: 10, value: 1000, stolen: false },
      { commodity: 'platinum', locName: 'Platinum', qty: 5, value: 500, stolen: false },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ name: 'platinum', tons: 15, value: 1500, stolen: false });
  });

  it('flags stolen if any stack in the stack is stolen', () => {
    const [item] = parseCargo([
      { commodity: 'gold', locName: 'Gold', qty: 4, stolen: false },
      { commodity: 'gold', locName: 'Gold', qty: 2, stolen: true },
    ]);
    expect(item).toMatchObject({ tons: 6, stolen: true });
  });

  it('coerces string quantities and drops empty/zero stacks', () => {
    const out = parseCargo([
      { commodity: 'tritium', locName: 'Tritium', qty: '250' },
      { commodity: 'water', locName: 'Water', qty: 0 },
      { locName: 'Mystery' }, // no id, no qty
    ]);
    expect(out).toEqual([
      { name: 'tritium', locName: 'Tritium', tons: 250, stolen: false, value: null },
    ]);
  });

  it('sorts by tons descending', () => {
    const out = parseCargo([
      { commodity: 'a', locName: 'A', qty: 5 },
      { commodity: 'b', locName: 'B', qty: 50 },
      { commodity: 'c', locName: 'C', qty: 20 },
    ]);
    expect(out.map((c) => c.name)).toEqual(['b', 'c', 'a']);
  });
});
