import type { StateStore } from './store.js';
import { commanderReducer } from './commander.reducer.js';
import { sessionReducer } from './session.reducer.js';
import { explorationReducer } from './exploration.reducer.js';
import { targetReducer } from './target.reducer.js';
import { miningReducer } from './mining.reducer.js';

/** Central place to register all slice reducers. */
export function registerReducers(store: StateStore): void {
  store.register('commander', commanderReducer);
  store.register('session', sessionReducer);
  store.register('exploration', explorationReducer);
  store.register('target', targetReducer);
  store.register('mining', miningReducer);
}
