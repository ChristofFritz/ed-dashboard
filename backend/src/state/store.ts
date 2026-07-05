import type { AppState, JournalEvent, SliceName } from '@ed/shared';
import { initialAppState } from './initial.js';

export type Reducer<K extends SliceName> = (
  slice: AppState[K],
  event: JournalEvent,
  state: Readonly<AppState>,
) => AppState[K];

export interface StoreListener {
  onSlices(dirty: SliceName[], state: AppState): void;
  onEvent(event: JournalEvent): void;
}

const FLUSH_INTERVAL_MS = 100;

/**
 * Holds the app state slices. Journal events run through per-slice reducers;
 * sidecar files patch slices directly via update(). Slice changes are
 * batched and flushed to listeners at most every FLUSH_INTERVAL_MS.
 */
export class StateStore {
  private state = initialAppState();
  private reducers: { [K in SliceName]?: Reducer<K>[] } = {};
  private dirty = new Set<SliceName>();
  private listeners = new Set<StoreListener>();
  private flushTimer: NodeJS.Timeout | null = null;

  register<K extends SliceName>(slice: K, reducer: Reducer<K>): void {
    ((this.reducers[slice] ??= []) as Reducer<K>[]).push(reducer);
  }

  getState(): Readonly<AppState> {
    return this.state;
  }

  subscribe(listener: StoreListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Run a journal event through all reducers. silent=true during hydration replay. */
  dispatch(event: JournalEvent, opts: { silent?: boolean } = {}): void {
    for (const slice of Object.keys(this.reducers) as SliceName[]) {
      for (const reducer of this.reducers[slice] ?? []) {
        try {
          const next = (reducer as Reducer<typeof slice>)(this.state[slice], event, this.state);
          if (next !== this.state[slice]) {
            (this.state[slice] as AppState[typeof slice]) = next;
            this.dirty.add(slice);
          }
        } catch (err) {
          console.error(`reducer error (${slice}, ${event.event}):`, err);
        }
      }
    }
    if (!opts.silent) {
      for (const l of this.listeners) l.onEvent(event);
      this.scheduleFlush();
    }
  }

  /** Patch a slice directly (sidecar data). */
  update<K extends SliceName>(slice: K, patch: Partial<AppState[K]>): void {
    this.state[slice] = { ...this.state[slice], ...patch };
    this.dirty.add(slice);
    this.scheduleFlush();
  }

  /** Force-notify all dirty slices now (end of hydration). */
  flush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.dirty.size === 0) return;
    const dirty = [...this.dirty];
    this.dirty.clear();
    for (const l of this.listeners) l.onSlices(dirty, this.state);
  }

  private scheduleFlush(): void {
    if (this.flushTimer || this.dirty.size === 0) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, FLUSH_INTERVAL_MS);
  }
}
