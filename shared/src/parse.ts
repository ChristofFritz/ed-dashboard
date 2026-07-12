import type { JournalEvent } from './journal-events.js';

/** Parse one raw journal line into a JournalEvent, or null if not a valid event. */
export function parseJournalLine(line: string): JournalEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed?.event !== 'string' || typeof parsed?.timestamp !== 'string') return null;
    return parsed as JournalEvent;
  } catch {
    return null;
  }
}
