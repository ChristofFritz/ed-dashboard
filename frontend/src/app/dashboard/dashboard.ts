import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { WsService } from '../core/ws.service';
import { FontScaleService } from '../core/font-scale.service';
import { PanelFrame } from '../shared/panel-frame';
import { EventTicker } from './event-ticker';
import { SessionPanel } from '../panels/session-panel';
import { ExplorationPanel } from '../panels/exploration-panel';
import { TargetPanel } from '../panels/target-panel';
import { MiningPanel } from '../panels/mining-panel';

type PanelId = 'exploration' | 'target' | 'mining' | 'session';

const ACTIVITY_PANEL: Record<string, PanelId> = {
  exploration: 'exploration',
  combat: 'target',
  mining: 'mining',
  overview: 'session',
};

@Component({
  selector: 'ed-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelFrame, EventTicker, SessionPanel, ExplorationPanel, TargetPanel, MiningPanel],
  template: `
    <div class="shell">
      <header class="topbar">
        <h1>ED HELPER</h1>
        <span class="right">
          <span class="zoom">
            <button (click)="fontScale.decrease()" title="Smaller text">A−</button>
            <button class="pct" (click)="fontScale.reset()" title="Reset text size">
              {{ Math.round(fontScale.scale() * 100) }}%
            </button>
            <button (click)="fontScale.increase()" title="Larger text">A+</button>
          </span>
          <span class="conn" [class.on]="ws.connected()">
            {{ ws.connected() ? '● CONNECTED' : '○ DISCONNECTED' }}
          </span>
        </span>
      </header>
      <main class="grid" [style.grid-template-areas]="gridAreas()">
        <div class="cell" style="grid-area: exploration">
          <ed-panel-frame
            title="Exploration"
            [stale]="stale()"
            [pinned]="pinned() === 'exploration'"
            (headerClick)="togglePin('exploration')"
          >
            <ed-exploration-panel />
          </ed-panel-frame>
        </div>
        <div class="cell" style="grid-area: target">
          <ed-panel-frame
            title="Target"
            [stale]="stale()"
            [pinned]="pinned() === 'target'"
            (headerClick)="togglePin('target')"
          >
            <ed-target-panel />
          </ed-panel-frame>
        </div>
        <div class="cell" style="grid-area: mining">
          <ed-panel-frame
            title="Mining"
            [stale]="stale()"
            [pinned]="pinned() === 'mining'"
            (headerClick)="togglePin('mining')"
          >
            <ed-mining-panel />
          </ed-panel-frame>
        </div>
        <div class="cell" style="grid-area: session">
          <ed-panel-frame
            title="Session"
            [stale]="stale()"
            [pinned]="pinned() === 'session'"
            (headerClick)="togglePin('session')"
          >
            <ed-session-panel />
          </ed-panel-frame>
        </div>
      </main>
      <ed-event-ticker />
    </div>
  `,
  styles: `
    .shell {
      display: flex;
      flex-direction: column;
      height: 100vh;
    }
    .topbar {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      padding: 0.5rem 1rem;
      border-bottom: 1px solid var(--panel-border);
    }
    h1 {
      margin: 0;
      font-size: 1rem;
      color: var(--accent);
    }
    .right {
      display: flex;
      align-items: center;
      gap: 1.2rem;
    }
    .zoom {
      display: flex;
      gap: 0.25rem;
    }
    .zoom button {
      background: none;
      border: 1px solid var(--panel-border);
      color: var(--text-dim);
      font-family: var(--font);
      font-size: 0.7rem;
      padding: 0.15rem 0.45rem;
      cursor: pointer;
    }
    .zoom button:hover {
      color: var(--accent);
      border-color: var(--accent-dim);
    }
    .zoom .pct {
      min-width: 3.2rem;
    }
    .conn {
      font-size: 0.75rem;
      color: var(--danger);
    }
    .conn.on {
      color: var(--ok);
    }
    .grid {
      flex: 1;
      min-height: 0;
      display: grid;
      grid-template-columns: 2fr 1fr;
      grid-template-rows: repeat(3, minmax(0, 1fr));
      gap: 8px;
      padding: 8px;
    }
    .cell {
      min-height: 0;
      min-width: 0;
    }
    @media (max-width: 900px) {
      .grid {
        display: flex;
        flex-direction: column;
        overflow-y: auto;
      }
      .cell {
        min-height: 260px;
      }
    }
  `,
})
export class Dashboard {
  protected readonly ws = inject(WsService);
  protected readonly fontScale = inject(FontScaleService);
  protected readonly Math = Math;
  protected readonly pinned = signal<PanelId | null>(null);

  protected readonly stale = computed(() => this.ws.commander()?.statusStale ?? false);

  protected readonly focus = computed<PanelId>(() => {
    const pin = this.pinned();
    if (pin) return pin;
    return ACTIVITY_PANEL[this.ws.session()?.activity ?? 'overview'] ?? 'session';
  });

  /** Focused panel fills the left 2/3; the other three stack on the right. */
  protected readonly gridAreas = computed(() => {
    const focus = this.focus();
    const others = (['exploration', 'target', 'mining', 'session'] as PanelId[]).filter(
      (p) => p !== focus,
    );
    return `"${focus} ${others[0]}" "${focus} ${others[1]}" "${focus} ${others[2]}"`;
  });

  protected togglePin(panel: PanelId): void {
    this.pinned.update((current) => (current === panel ? null : panel));
  }
}
