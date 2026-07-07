import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { WsService } from '../core/ws.service';
import { NumPipe } from '../core/format';

@Component({
  selector: 'ed-carrier-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NumPipe],
  template: `
    @let c = ws.carrier();
    @if (!c || c.auth === 'unlinked' || c.auth === 'error') {
      <div class="link">
        <p class="dim">Fleet carrier cargo isn't in the journals — link Frontier once to read it.</p>
        @if (c?.lastError; as err) {
          <p class="err">{{ err }}</p>
        }
        <a class="btn" href="/api/capi/login">CONNECT FRONTIER ACCOUNT</a>
      </div>
    } @else {
      <div class="head">
        <span class="name">{{ c.name || 'Fleet Carrier' }}</span>
        @if (c.callsign) {
          <span class="callsign">{{ c.callsign }}</span>
        }
        <span class="spacer"></span>
        <span class="dim total">{{ c.totalTons | num }} t</span>
        <button class="refresh" (click)="refresh()" [disabled]="busy()" title="Refresh from Frontier">
          {{ busy() ? '…' : '↻' }}
        </button>
      </div>

      @if (c.cargo.length === 0) {
        <p class="dim">{{ c.lastError || 'Carrier hold is empty.' }}</p>
      } @else {
        <div class="rows">
          @for (item of c.cargo; track item.name) {
            <div class="row">
              <span class="cname">{{ item.locName }}</span>
              @if (item.stolen) {
                <span class="stolen" title="Stolen">⚠</span>
              }
              <span class="tons">{{ item.tons | num }} t</span>
            </div>
          }
        </div>
      }

      <div class="foot dim">
        @if (updated(); as u) {
          updated {{ u }}
        }
      </div>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
    }
    .dim {
      color: var(--text-dim);
    }
    .err {
      color: var(--danger);
      font-size: 0.75rem;
    }
    .link {
      display: flex;
      flex-direction: column;
      gap: 0.6rem;
      align-items: flex-start;
    }
    .btn {
      border: 1px solid var(--accent-dim);
      color: var(--accent);
      padding: 0.35rem 0.7rem;
      font-size: 0.75rem;
      text-decoration: none;
      letter-spacing: 0.05em;
    }
    .btn:hover {
      border-color: var(--accent);
    }
    .head {
      display: flex;
      align-items: baseline;
      gap: 0.5rem;
    }
    .name {
      color: var(--accent);
    }
    .callsign {
      font-size: 0.7rem;
      color: var(--text-dim);
      border: 1px solid var(--panel-border);
      padding: 0 0.25rem;
    }
    .spacer {
      flex: 1;
    }
    .total {
      font-variant-numeric: tabular-nums;
    }
    .refresh {
      background: none;
      border: 1px solid var(--panel-border);
      color: var(--text-dim);
      cursor: pointer;
      font-family: var(--font);
      padding: 0 0.35rem;
    }
    .refresh:hover:not(:disabled) {
      color: var(--accent);
      border-color: var(--accent-dim);
    }
    .rows {
      overflow-y: auto;
      margin-top: 0.35rem;
      flex: 1;
      min-height: 0;
    }
    .row {
      display: flex;
      align-items: baseline;
      gap: 0.4rem;
      font-size: 0.85rem;
      padding: 0.06rem 0;
    }
    .cname {
      flex: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .stolen {
      color: var(--warn);
      font-size: 0.7rem;
    }
    .tons {
      color: var(--text-dim);
      font-variant-numeric: tabular-nums;
    }
    .foot {
      font-size: 0.65rem;
      margin-top: 0.35rem;
    }
  `,
})
export class CarrierPanel {
  protected readonly ws = inject(WsService);
  protected readonly busy = signal(false);

  protected readonly updated = computed(() => {
    const iso = this.ws.carrier()?.updatedAt;
    if (!iso) return null;
    const secs = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
    if (secs < 60) return 'just now';
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
    return `${Math.floor(secs / 3600)}h ago`;
  });

  protected async refresh(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await fetch('/api/capi/refresh', { method: 'POST' });
    } finally {
      this.busy.set(false);
    }
  }
}
