import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { WsService } from '../core/ws.service';
import { NumPipe } from '../core/format';

@Component({
  selector: 'ed-mining-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NumPipe],
  template: `
    @if (ws.mining(); as mining) {
      @if (mining.lastProspected; as p) {
        <div class="prospect" [class.motherlode]="p.motherlode">
          <div class="p-head">
            <span class="label">PROSPECTOR</span>
            <span [class]="contentClass(p.content)">{{ p.content }}</span>
            <span class="dim">{{ p.remaining | num }}% left</span>
          </div>
          @if (p.motherlode) {
            <div class="core">◆ CORE: {{ p.motherlode }}</div>
          }
          @for (m of p.materials; track m.name) {
            <div class="mat-row">
              <span class="mat-name">{{ m.name }}</span>
              <div class="bar">
                <div class="fill" [style.width.%]="m.proportion"></div>
              </div>
              <span class="pct">{{ m.proportion | num: 1 }}%</span>
            </div>
          }
        </div>
      } @else {
        <p class="dim no-data">NO PROSPECTOR DATA</p>
      }

      <div class="totals">
        <div class="stat">
          <span class="value accent">{{ mining.refinedTotal | num }}t</span>
          <span class="label">REFINED</span>
        </div>
        <div class="stat">
          <span class="value">
            {{ mining.cargoCount | num }}<span class="dim">/{{ mining.cargoCapacity ?? '?' }}</span>
          </span>
          <span class="label">CARGO</span>
        </div>
        <div class="stat">
          <span class="value">{{ mining.limpetsLaunched | num }}</span>
          <span class="label">LIMPETS</span>
        </div>
      </div>

      @if (refinedRows().length) {
        <div class="refined">
          @for (row of refinedRows(); track row.name) {
            <div class="ref-row">
              <span>{{ row.name }}</span>
              <span class="accent">{{ row.count }}t</span>
            </div>
          }
        </div>
      }

      @if (mining.cargo.length) {
        <h3>CARGO</h3>
        @for (item of mining.cargo; track item.name) {
          <div class="ref-row">
            <span>{{ item.name }}</span>
            <span>{{ item.count }}t</span>
          </div>
        }
      }
    }
  `,
  styles: `
    .prospect {
      border: 1px solid var(--panel-border);
      padding: 0.5rem 0.7rem;
      margin-bottom: 0.6rem;
    }
    .prospect.motherlode {
      border-color: var(--accent);
    }
    .p-head {
      display: flex;
      gap: 0.8rem;
      align-items: baseline;
      margin-bottom: 0.3rem;
    }
    .label {
      color: var(--text-dim);
      font-size: 0.65rem;
      letter-spacing: 0.1em;
    }
    .content-high {
      color: var(--accent);
    }
    .content-medium {
      color: var(--warn);
    }
    .content-low {
      color: var(--text-dim);
    }
    .core {
      color: var(--accent);
      font-size: 0.95rem;
      margin: 0.2rem 0;
    }
    .mat-row {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      padding: 0.12rem 0;
      font-size: 0.85rem;
    }
    .mat-name {
      min-width: 9rem;
    }
    .bar {
      flex: 1;
      height: 7px;
      background: #0a0a0d;
      border: 1px solid var(--panel-border);
    }
    .fill {
      height: 100%;
      background: var(--accent-dim);
    }
    .pct {
      min-width: 3.5rem;
      text-align: right;
    }
    .dim {
      color: var(--text-dim);
    }
    .no-data {
      text-align: center;
      padding: 0.8rem 0;
      letter-spacing: 0.2em;
    }
    .totals {
      display: flex;
      gap: 1.5rem;
      margin-bottom: 0.5rem;
    }
    .stat {
      display: flex;
      flex-direction: column;
    }
    .value {
      font-size: 1.1rem;
    }
    .accent {
      color: var(--accent);
    }
    .refined,
    h3 {
      border-top: 1px solid var(--panel-border);
      padding-top: 0.4rem;
    }
    h3 {
      margin: 0.6rem 0 0.3rem;
      font-size: 0.7rem;
      color: var(--text-dim);
    }
    .ref-row {
      display: flex;
      justify-content: space-between;
      font-size: 0.85rem;
      padding: 0.1rem 0;
    }
  `,
})
export class MiningPanel {
  protected readonly ws = inject(WsService);

  protected readonly refinedRows = computed(() => {
    const counts = this.ws.mining()?.refinedCounts ?? {};
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  });

  protected contentClass(content: string): string {
    const c = content.toLowerCase();
    if (c.includes('high')) return 'content-high';
    if (c.includes('medium')) return 'content-medium';
    return 'content-low';
  }
}
