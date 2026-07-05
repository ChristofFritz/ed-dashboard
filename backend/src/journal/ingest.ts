import { JournalTailer, TailBatch } from './tailer.js';

/**
 * Serializes tail polls so batches (and later their DB writes) are processed
 * strictly in arrival order, one at a time.
 */
export class JournalIngest {
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private tailer: JournalTailer,
    private onBatch: (batch: TailBatch) => void | Promise<void>,
  ) {}

  fileChanged(filePath: string): void {
    this.queue = this.queue.then(async () => {
      const batch = await this.tailer.poll(filePath);
      if (batch) await this.onBatch(batch);
    }).catch((err) => console.error(`ingest error for ${filePath}:`, err));
  }

  /** Await all queued work (used in tests and shutdown). */
  flush(): Promise<void> {
    return this.queue;
  }
}
