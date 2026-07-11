import type { CarrierState, JournalEvent } from '@ed/shared';

/**
 * The Frontier cAPI only refreshes carrier cargo every poll interval (~10 min),
 * so a ship→carrier transfer would drop off the ship (Cargo.json is instant)
 * long before it shows up on the carrier — making delivered items look unbought.
 * Apply the real-time CargoTransfer event optimistically to bridge that gap;
 * the next cAPI poll overwrites this with authoritative data.
 */
export function carrierReducer(slice: CarrierState, e: JournalEvent): CarrierState {
  if (e.event !== 'CargoTransfer' || slice.auth !== 'linked') return slice;

  const cargo = slice.cargo.map((c) => ({ ...c }));
  let changed = false;
  for (const t of e.Transfers) {
    const delta = t.Direction === 'tocarrier' ? t.Count : t.Direction === 'toship' ? -t.Count : 0;
    if (delta === 0) continue;
    const id = t.Type.toLowerCase();
    const idx = cargo.findIndex((c) => c.name.toLowerCase() === id);
    if (idx >= 0) {
      cargo[idx]!.tons += delta;
      if (cargo[idx]!.tons <= 0) cargo.splice(idx, 1);
      changed = true;
    } else if (delta > 0) {
      cargo.push({
        name: t.Type,
        locName: t.Type_Localised ?? t.Type,
        tons: delta,
        stolen: false,
        value: null,
      });
      changed = true;
    }
  }
  if (!changed) return slice;

  cargo.sort((a, b) => b.tons - a.tons);
  return { ...slice, cargo, totalTons: cargo.reduce((s, c) => s + c.tons, 0) };
}
