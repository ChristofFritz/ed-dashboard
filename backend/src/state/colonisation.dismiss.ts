import type { EventStore } from '../db/event-store.js';

const KEY = 'colonisation_dismissed';

/** marketId (string) -> ISO timestamp at which it was dismissed. */
export type DismissedMap = Record<string, string>;

export function getDismissed(events: EventStore): DismissedMap {
  try {
    return JSON.parse(events.getMeta(KEY) ?? '{}') as DismissedMap;
  } catch {
    return {};
  }
}

/**
 * Mark a project deleted as of `at`. The seed then hides it unless a newer
 * depot event appears (i.e. you re-dock and work it again), which resurrects it.
 */
export function dismissProject(events: EventStore, marketId: number, at: string): void {
  const d = getDismissed(events);
  d[String(marketId)] = at;
  events.setMeta(KEY, JSON.stringify(d));
}

/** True if a project last updated at `updatedAt` is currently dismissed. */
export function isDismissed(d: DismissedMap, marketId: number, updatedAt: string): boolean {
  const at = d[String(marketId)];
  return at != null && Date.parse(updatedAt) <= Date.parse(at);
}
