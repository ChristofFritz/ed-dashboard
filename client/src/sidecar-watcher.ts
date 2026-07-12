import chokidar, { FSWatcher } from 'chokidar';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { SidecarFileName } from '@ed/shared';
import { config } from './config.js';

const SIDECAR_FILES: SidecarFileName[] = ['Status.json', 'Cargo.json', 'NavRoute.json', 'Market.json'];

const DEBOUNCE_MS = 200;
const PARSE_RETRIES = 3;
const RETRY_DELAY_MS = 100;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Watches the game's sidecar JSON files. The game rewrites them whole and
 * non-atomically, so reads are debounced and JSON.parse failures retried.
 */
export function watchSidecars(onChange: (file: SidecarFileName, data: unknown) => void): FSWatcher {
  const timers = new Map<SidecarFileName, NodeJS.Timeout>();

  const readAndEmit = async (file: SidecarFileName) => {
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
    { usePolling: config.usePolling, interval: config.pollIntervalMs, alwaysStat: true },
  );

  const handle = (filePath: string) => {
    const file = path.basename(filePath) as SidecarFileName;
    if (!SIDECAR_FILES.includes(file)) return;
    clearTimeout(timers.get(file));
    timers.set(file, setTimeout(() => void readAndEmit(file), DEBOUNCE_MS));
  };
  watcher.on('add', handle);
  watcher.on('change', handle);
  watcher.on('error', (err) => console.error('sidecar watcher error:', err));
  return watcher;
}
