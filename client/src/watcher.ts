import chokidar, { FSWatcher } from 'chokidar';
import path from 'node:path';
import { config } from './config.js';

const JOURNAL_RE = /^Journal\.[0-9T.-]+\.log$/;

export function isJournalFile(filePath: string): boolean {
  return JOURNAL_RE.test(path.basename(filePath));
}

/**
 * Watches the journal directory and invokes onJournalChange for every journal
 * file add/append. chokidar v4 has no glob support, so we watch the directory
 * (depth 0) and filter by filename.
 */
export function watchJournalDir(onJournalChange: (filePath: string) => void): FSWatcher {
  const watcher = chokidar.watch(config.journalDir, {
    usePolling: config.usePolling,
    interval: config.pollIntervalMs,
    binaryInterval: config.pollIntervalMs,
    depth: 0,
    alwaysStat: true,
  });
  const handle = (filePath: string) => {
    if (isJournalFile(filePath)) onJournalChange(filePath);
  };
  watcher.on('add', handle);
  watcher.on('change', handle);
  watcher.on('error', (err) => console.error('journal watcher error:', err));
  return watcher;
}
