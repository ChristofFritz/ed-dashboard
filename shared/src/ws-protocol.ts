import type { AppState, SliceName } from './state.js';
import type { JournalEvent } from './journal-events.js';

export type ServerMessage =
  | { type: 'snapshot'; state: AppState }
  | { type: 'slice'; slice: SliceName; data: AppState[SliceName] }
  | { type: 'event'; data: JournalEvent };

export type ClientMessage = never; // v1: client only listens
