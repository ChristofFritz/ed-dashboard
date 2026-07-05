import type { JournalEvent } from '@ed/shared';

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
