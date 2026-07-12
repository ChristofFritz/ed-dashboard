import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

interface FileOffset {
  offset: number;
  lineNo: number;
}

/**
 * Persists per-file byte offsets so a restart resumes where it left off
 * instead of re-streaming whole journals. (The server de-dupes re-sends too,
 * so this is an optimisation, not a correctness requirement.)
 */
export class OffsetStore {
  private readonly file: string;
  private data: Record<string, FileOffset> = {};
  private saveTimer: NodeJS.Timeout | null = null;

  constructor(dir: string) {
    this.file = path.join(dir, 'offsets.json');
  }

  async load(): Promise<void> {
    try {
      this.data = JSON.parse(await readFile(this.file, 'utf8')) as Record<string, FileOffset>;
    } catch {
      this.data = {};
    }
  }

  get(filename: string): FileOffset | undefined {
    return this.data[filename];
  }

  set(filename: string, offset: number, lineNo: number): void {
    this.data[filename] = { offset, lineNo };
    this.scheduleSave();
  }

  private scheduleSave(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.flush();
    }, 500);
  }

  async flush(): Promise<void> {
    await mkdir(path.dirname(this.file), { recursive: true });
    await writeFile(this.file, JSON.stringify(this.data), 'utf8');
  }
}
