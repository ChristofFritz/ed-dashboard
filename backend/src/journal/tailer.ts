import { open } from 'node:fs/promises';
import path from 'node:path';
import { parseJournalLine } from './parse.js';
import type { JournalEvent } from '@ed/shared';

export interface TailBatch {
  filename: string;
  events: { lineNo: number; raw: string; event: JournalEvent }[];
  /** byte offset after consuming this batch (only complete lines) */
  newOffset: number;
}

interface FileCursor {
  offset: number; // bytes consumed, always at a line boundary
  lineNo: number; // complete lines consumed so far
}

const NEWLINE = 0x0a;

/**
 * Offset-tracked tailer for journal files. Each poll reads bytes past the
 * cursor and consumes only complete (newline-terminated) lines; a trailing
 * partial line stays on disk and is re-read next poll. Offsets therefore
 * always sit on line boundaries, so a consumer persisting `newOffset` never
 * loses or duplicates events across restarts.
 */
export class JournalTailer {
  private cursors = new Map<string, FileCursor>();

  /** Seed a cursor (e.g. from persisted DB offsets) before the first poll. */
  seed(filename: string, offset: number, lineNo: number): void {
    this.cursors.set(filename, { offset, lineNo });
  }

  has(filename: string): boolean {
    return this.cursors.has(filename);
  }

  /** Read any new complete lines from the file. Returns null if nothing new. */
  async poll(filePath: string): Promise<TailBatch | null> {
    const filename = path.basename(filePath);
    let cursor = this.cursors.get(filename);
    if (!cursor) {
      cursor = { offset: 0, lineNo: 0 };
      this.cursors.set(filename, cursor);
    }

    let fh;
    try {
      fh = await open(filePath, 'r');
    } catch {
      return null; // file vanished between watch event and read
    }
    try {
      const stat = await fh.stat();
      if (stat.size < cursor.offset) {
        // Journal files are append-only; shrinkage means something odd. Re-read.
        cursor.offset = 0;
        cursor.lineNo = 0;
      }
      if (stat.size === cursor.offset) return null;

      const toRead = stat.size - cursor.offset;
      const buf = Buffer.alloc(toRead);
      const { bytesRead } = await fh.read(buf, 0, toRead, cursor.offset);
      const data = buf.subarray(0, bytesRead);

      const events: TailBatch['events'] = [];
      let start = 0;
      for (let i = 0; i < data.length; i++) {
        if (data[i] !== NEWLINE) continue;
        const line = data.subarray(start, i).toString('utf8');
        cursor.lineNo++;
        const event = parseJournalLine(line);
        if (event) events.push({ lineNo: cursor.lineNo, raw: line.trim(), event });
        start = i + 1;
      }
      cursor.offset += start; // only complete lines; partial tail re-read next poll

      if (events.length === 0) return null;
      return { filename, events, newOffset: cursor.offset };
    } finally {
      await fh.close();
    }
  }
}
