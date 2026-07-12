import type { IngestPayload, IngestResponse } from '@ed/shared';
import { config } from './config.js';

const MAX_BACKOFF_MS = 30_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** POSTs journal batches / sidecars to the hosted server's ingest endpoint. */
export class IngestClient {
  private readonly url = `${config.serverUrl}/api/ingest`;

  /** One attempt. Throws on network error or non-2xx (so callers can retry). */
  private async post(payload: IngestPayload): Promise<number> {
    const res = await fetch(this.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.ingestToken}`,
      },
      body: JSON.stringify(payload),
    });
    if (res.status === 401) throw new Error('ingest token rejected (401) — check ED_INGEST_TOKEN');
    if (!res.ok) throw new Error(`ingest failed: ${res.status} ${await res.text().catch(() => '')}`);
    return ((await res.json()) as IngestResponse).accepted;
  }

  /**
   * Send with exponential backoff, retrying indefinitely on transient failures
   * so nothing is dropped while the server is briefly unreachable. Fatal auth
   * errors are re-thrown immediately.
   */
  async send(payload: IngestPayload): Promise<number> {
    let backoff = 1000;
    for (;;) {
      try {
        return await this.post(payload);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('401')) throw err;
        console.error(`ingest error, retrying in ${backoff}ms: ${msg}`);
        await sleep(backoff);
        backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
      }
    }
  }
}
