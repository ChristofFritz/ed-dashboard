import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  OnDestroy,
  viewChild,
} from '@angular/core';
import { GridStack, GridStackNode } from 'gridstack';
import { WsService } from '../core/ws.service';
import { FontScaleService } from '../core/font-scale.service';
import { PanelFrame } from '../shared/panel-frame';
import { EventTicker } from './event-ticker';
import { SessionPanel } from '../panels/session-panel';
import { ExplorationPanel } from '../panels/exploration-panel';
import { TargetPanel } from '../panels/target-panel';
import { MiningPanel } from '../panels/mining-panel';
import { RoutePanel } from '../panels/route-panel';
import { CarrierPanel } from '../panels/carrier-panel';

type PanelId = 'exploration' | 'target' | 'mining' | 'session' | 'route' | 'carrier';
interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const COLUMNS = 12;
const STORAGE_KEY = 'ed-dashboard-layout-v4';

const DEFAULT_LAYOUT: Record<PanelId, Box> = {
  exploration: { x: 0, y: 0, w: 8, h: 4 },
  target: { x: 8, y: 0, w: 4, h: 4 },
  mining: { x: 0, y: 4, w: 4, h: 4 },
  session: { x: 4, y: 4, w: 4, h: 4 },
  route: { x: 8, y: 4, w: 4, h: 4 },
  carrier: { x: 0, y: 8, w: 4, h: 4 },
};

@Component({
  selector: 'ed-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PanelFrame,
    EventTicker,
    SessionPanel,
    ExplorationPanel,
    TargetPanel,
    MiningPanel,
    RoutePanel,
    CarrierPanel,
  ],
  template: `
    <div class="shell">
      <header class="topbar">
        <h1>ED HELPER</h1>
        <span class="right">
          <button class="reset" (click)="resetLayout()" title="Reset panel layout">
            RESET LAYOUT
          </button>
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

      <main class="grid-stack" #gridEl>
        <div
          class="grid-stack-item"
          gs-id="exploration"
          [attr.gs-x]="layout.exploration.x"
          [attr.gs-y]="layout.exploration.y"
          [attr.gs-w]="layout.exploration.w"
          [attr.gs-h]="layout.exploration.h"
        >
          <div class="grid-stack-item-content">
            <ed-panel-frame title="Exploration" [stale]="stale()">
              <ed-exploration-panel />
            </ed-panel-frame>
          </div>
        </div>

        <div
          class="grid-stack-item"
          gs-id="target"
          [attr.gs-x]="layout.target.x"
          [attr.gs-y]="layout.target.y"
          [attr.gs-w]="layout.target.w"
          [attr.gs-h]="layout.target.h"
        >
          <div class="grid-stack-item-content">
            <ed-panel-frame title="Target" [stale]="stale()">
              <ed-target-panel />
            </ed-panel-frame>
          </div>
        </div>

        <div
          class="grid-stack-item"
          gs-id="mining"
          [attr.gs-x]="layout.mining.x"
          [attr.gs-y]="layout.mining.y"
          [attr.gs-w]="layout.mining.w"
          [attr.gs-h]="layout.mining.h"
        >
          <div class="grid-stack-item-content">
            <ed-panel-frame title="Mining" [stale]="stale()">
              <ed-mining-panel />
            </ed-panel-frame>
          </div>
        </div>

        <div
          class="grid-stack-item"
          gs-id="session"
          [attr.gs-x]="layout.session.x"
          [attr.gs-y]="layout.session.y"
          [attr.gs-w]="layout.session.w"
          [attr.gs-h]="layout.session.h"
        >
          <div class="grid-stack-item-content">
            <ed-panel-frame title="Session" [stale]="stale()">
              <ed-session-panel />
            </ed-panel-frame>
          </div>
        </div>

        <div
          class="grid-stack-item"
          gs-id="route"
          [attr.gs-x]="layout.route.x"
          [attr.gs-y]="layout.route.y"
          [attr.gs-w]="layout.route.w"
          [attr.gs-h]="layout.route.h"
        >
          <div class="grid-stack-item-content">
            <ed-panel-frame title="Route" [stale]="stale()">
              <ed-route-panel />
            </ed-panel-frame>
          </div>
        </div>

        <div
          class="grid-stack-item"
          gs-id="carrier"
          [attr.gs-x]="layout.carrier.x"
          [attr.gs-y]="layout.carrier.y"
          [attr.gs-w]="layout.carrier.w"
          [attr.gs-h]="layout.carrier.h"
        >
          <div class="grid-stack-item-content">
            <ed-panel-frame title="Carrier">
              <ed-carrier-panel />
            </ed-panel-frame>
          </div>
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
    button {
      background: none;
      border: 1px solid var(--panel-border);
      color: var(--text-dim);
      font-family: var(--font);
      font-size: 0.7rem;
      padding: 0.15rem 0.45rem;
      cursor: pointer;
    }
    button:hover {
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
    .grid-stack {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
    }
    /* let the panel frame own the cell; keep gridstack's own inset (= the gutter) */
    ::ng-deep .grid-stack > .grid-stack-item > .grid-stack-item-content {
      overflow: hidden;
      display: flex;
    }
  `,
})
export class Dashboard implements AfterViewInit, OnDestroy {
  protected readonly ws = inject(WsService);
  protected readonly fontScale = inject(FontScaleService);
  protected readonly Math = Math;

  private readonly gridEl = viewChild.required<ElementRef<HTMLElement>>('gridEl');
  private grid?: GridStack;
  private readonly onResize = () => this.grid?.cellHeight(this.cellHeight());

  protected readonly stale = computed(() => this.ws.commander()?.statusStale ?? false);

  /** Read once at template render; gridstack owns the DOM attrs after init. */
  protected readonly layout: Record<PanelId, Box> = this.loadLayout();

  ngAfterViewInit(): void {
    this.grid = GridStack.init(
      {
        column: COLUMNS,
        margin: 8,
        cellHeight: this.cellHeight(),
        handle: 'header',
        float: true,
      },
      this.gridEl().nativeElement,
    );
    this.grid.on('change', () => this.persist());
    window.addEventListener('resize', this.onResize);
  }

  ngOnDestroy(): void {
    window.removeEventListener('resize', this.onResize);
    this.grid?.destroy(false);
  }

  protected resetLayout(): void {
    const grid = this.grid;
    if (!grid) return;
    grid.batchUpdate();
    for (const el of grid.getGridItems()) {
      const id = el.getAttribute('gs-id') as PanelId | null;
      if (id && DEFAULT_LAYOUT[id]) grid.update(el, DEFAULT_LAYOUT[id]);
    }
    grid.batchUpdate(false);
    localStorage.removeItem(STORAGE_KEY);
  }

  private cellHeight(): number {
    const rows = Math.max(...Object.values(this.layout).map((b) => b.y + b.h), 8);
    const h = this.gridEl().nativeElement.clientHeight;
    return Math.max(48, Math.floor(h / rows));
  }

  private persist(): void {
    if (!this.grid) return;
    const out: Partial<Record<PanelId, Box>> = {};
    for (const n of this.grid.save(false) as GridStackNode[]) {
      const id = n.id as PanelId | undefined;
      if (id) out[id] = { x: n.x ?? 0, y: n.y ?? 0, w: n.w ?? 1, h: n.h ?? 1 };
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(out));
  }

  private loadLayout(): Record<PanelId, Box> {
    const merged = { ...DEFAULT_LAYOUT };
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<Record<PanelId, Box>>;
        for (const id of Object.keys(merged) as PanelId[]) {
          const b = saved[id];
          if (b && [b.x, b.y, b.w, b.h].every((n) => typeof n === 'number')) merged[id] = b;
        }
      }
    } catch {
      /* fall back to defaults on any parse/storage error */
    }
    return merged;
  }
}
