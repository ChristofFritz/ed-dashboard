import chokidar, { FSWatcher } from 'chokidar';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';

export type SidecarFile = 'Status.json' | 'Cargo.json' | 'NavRoute.json';
const SIDECAR_FILES: SidecarFile[] = ['Status.json', 'Cargo.json', 'NavRoute.json'];

const DEBOUNCE_MS = 200;
const PARSE_RETRIES = 3;
const RETRY_DELAY_MS = 100;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Watches the game's sidecar JSON files. The game rewrites them whole and
 * non-atomically, so reads are debounced and JSON.parse failures retried.
 */
export function watchSidecars(
  onChange: (file: SidecarFile, data: unknown) => void,
): FSWatcher {
  const timers = new Map<SidecarFile, NodeJS.Timeout>();

  const readAndEmit = async (file: SidecarFile) => {
    const fullPath = path.join(config.journalDir, file);
    for (let attempt = 0; attempt < PARSE_RETRIES; attempt++) {
      try {
        const text = await readFile(fullPath, 'utf8');
        if (!text.trim()) throw new Error('empty');
        onChange(file, JSON.parse(text));
        return;
      } catch {
        await sleep(RETRY_DELAY_MS);
      }
    }
    // Torn read that never settled; next change event will retry.
  };

  const watcher = chokidar.watch(
    SIDECAR_FILES.map((f) => path.join(config.journalDir, f)),
    {
      usePolling: config.usePolling,
      interval: config.pollIntervalMs,
      alwaysStat: true,
    },
  );

  const handle = (filePath: string) => {
    const file = path.basename(filePath) as SidecarFile;
    if (!SIDECAR_FILES.includes(file)) return;
    clearTimeout(timers.get(file));
    timers.set(file, setTimeout(() => void readAndEmit(file), DEBOUNCE_MS));
  };
  watcher.on('add', handle);
  watcher.on('change', handle);
  watcher.on('error', (err) => console.error('sidecar watcher error:', err));
  return watcher;
}
