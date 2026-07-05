import { describe, expect, it } from 'vitest';
import { estimateBodyValue } from './body-value.js';

const Q = 0.56591828;

describe('estimateBodyValue', () => {
  it('values a known terraformable water world (hand-computed)', () => {
    // k = 64831 + 116295 = 181126, mass 1 ⇒ base = k * (1 + q)
    const base = 181126 * (1 + Q);
    const v = estimateBodyValue({
      planetClass: 'Water world',
      mass: 1,
      terraformable: true,
      firstDiscovered: false,
      firstMapped: false,
    });
    expect(v.scanValue).toBe(Math.round(base));
    expect(v.mappedValue).toBe(Math.round(base * 3.3333333333));
    expect(v.maxValue).toBe(Math.round(base * 3.3333333333 * 1.25));
  });

  it('applies first-discovery multiplier of 2.6', () => {
    const known = estimateBodyValue({
      planetClass: 'Metal rich body',
      mass: 0.5,
      terraformable: false,
      firstDiscovered: false,
      firstMapped: false,
    });
    const first = estimateBodyValue({
      planetClass: 'Metal rich body',
      mass: 0.5,
      terraformable: false,
      firstDiscovered: true,
      firstMapped: false,
    });
    expect(first.scanValue).toBe(Math.round((known.scanValue * 2.6) / 1));
  });

  it('uses the first-both mapping multiplier for virgin bodies', () => {
    const v = estimateBodyValue({
      planetClass: 'Earth-like body',
      mass: 1,
      terraformable: false,
      firstDiscovered: true,
      firstMapped: true,
    });
    const base = (64831 + 116295) * (1 + Q);
    expect(v.mappedValue).toBe(Math.round(base * 3.699622554 * 2.6));
  });

  it('ELW always gets the terraform bonus even when TerraformState is empty', () => {
    const elw = estimateBodyValue({
      planetClass: 'Earth-like body',
      mass: 1,
      terraformable: false,
      firstDiscovered: false,
      firstMapped: false,
    });
    expect(elw.scanValue).toBeGreaterThan(250_000);
  });

  it('floors tiny bodies at 500 cr', () => {
    const v = estimateBodyValue({
      planetClass: 'Icy body',
      mass: 0.0001,
      terraformable: false,
      firstDiscovered: false,
      firstMapped: false,
    });
    expect(v.scanValue).toBeGreaterThanOrEqual(500);
  });

  it('values stars by stellar mass and never adds mapping value', () => {
    const sun = estimateBodyValue({
      starType: 'G',
      mass: 1,
      terraformable: false,
      firstDiscovered: false,
      firstMapped: false,
    });
    expect(sun.scanValue).toBe(Math.round(1200 + (1 * 1200) / 66.25));
    expect(sun.maxValue).toBe(sun.scanValue);

    const neutron = estimateBodyValue({
      starType: 'N',
      mass: 1.5,
      terraformable: false,
      firstDiscovered: false,
      firstMapped: false,
    });
    expect(neutron.scanValue).toBe(Math.round(22628 + (1.5 * 22628) / 66.25));

    const whiteDwarf = estimateBodyValue({
      starType: 'DA',
      mass: 0.6,
      terraformable: false,
      firstDiscovered: false,
      firstMapped: false,
    });
    expect(whiteDwarf.scanValue).toBe(Math.round(14057 + (0.6 * 14057) / 66.25));
  });
});
