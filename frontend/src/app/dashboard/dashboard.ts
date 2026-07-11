import {
  AfterViewInit,
  ApplicationRef,
  ChangeDetectionStrategy,
  Component,
  ComponentRef,
  computed,
  ElementRef,
  EnvironmentInjector,
  createComponent,
  inject,
  OnDestroy,
  signal,
  viewChild,
} from '@angular/core';
import { GridStack, GridItemHTMLElement, GridStackNode } from 'gridstack';
import { WsService } from '../core/ws.service';
import { FontScaleService } from '../core/font-scale.service';
import { ThemeService } from '../core/theme.service';
import { EventTicker } from './event-ticker';
import { PanelHost } from './panel-host';
import { ConfirmModal } from '../shared/confirm-modal';
import { Box, isPanelId, PANELS, PANEL_MAP, type PanelId } from './panel-registry';

interface PanelBox extends Box {
  id: PanelId;
}
interface DashboardView {
  name: string;
  panels: PanelBox[];
}
interface Persisted {
  views: DashboardView[];
  active: string;
}

const COLUMNS = 12;
const STORAGE_KEY = 'ed-dashboard-views-v1';

function defaultView(): DashboardView {
  return {
    name: 'Default',
    panels: PANELS.map((p) => ({ id: p.id, ...p.defaultBox })),
  };
}

@Component({
  selector: 'ed-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EventTicker, ConfirmModal],
  template: `
    <div class="shell">
      <header class="topbar">
        <h1>ED HELPER</h1>
        <span class="right">
          <span class="views">
            <span class="vtabs">
              @for (v of views(); track v.name) {
                <button
                  class="vtab"
                  [class.on]="v.name === activeName()"
                  (click)="switchView(v.name)"
                  [title]="v.name"
                >
                  {{ v.name }}
                </button>
              }
            </span>
            <button (click)="saveViewAs()" title="Save current layout as a new view">+ SAVE AS</button>
            <button (click)="renameView()" title="Rename the active view">RENAME</button>
            <button
              (click)="deleteView()"
              title="Delete the active view"
              [disabled]="views().length <= 1"
            >
              DELETE
            </button>
          </span>

          <span class="addwrap">
            <button
              class="add"
              (click)="menuOpen.set(!menuOpen())"
              [disabled]="hidden().length === 0"
              title="Add a hidden panel"
            >
              + PANEL
            </button>
            @if (menuOpen()) {
              <div class="menu">
                @for (p of hidden(); track p.id) {
                  <button (click)="addPanel(p.id)">{{ p.title }}</button>
                }
              </div>
            }
          </span>

          <button class="reset" (click)="resetView()" title="Reset this view to defaults">
            RESET
          </button>
          <button
            (click)="theme.toggle()"
            [title]="theme.theme() === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'"
          >
            {{ theme.theme() === 'dark' ? '☀ LIGHT' : '☾ DARK' }}
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

      <main class="grid-stack" #gridEl></main>

      <ed-event-ticker />
    </div>
    <ed-confirm-modal />
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
      white-space: nowrap;
    }
    .right {
      display: flex;
      align-items: center;
      gap: 1rem;
      flex-wrap: wrap;
      justify-content: flex-end;
    }
    .views,
    .zoom {
      display: flex;
      gap: 0.25rem;
      align-items: center;
    }
    .vtabs {
      display: flex;
      gap: 0.2rem;
      flex-wrap: wrap;
    }
    .vtab {
      max-width: 12rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .vtab.on {
      color: var(--accent);
      border-color: var(--accent);
      background: color-mix(in srgb, var(--accent) 12%, transparent);
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
    button:hover:not(:disabled) {
      color: var(--accent);
      border-color: var(--accent-dim);
    }
    button:disabled {
      opacity: 0.4;
      cursor: default;
    }
    .addwrap {
      position: relative;
    }
    .menu {
      position: absolute;
      right: 0;
      top: 1.6rem;
      z-index: 20;
      background: var(--panel);
      border: 1px solid var(--panel-border);
      display: flex;
      flex-direction: column;
      min-width: 9rem;
    }
    .menu button {
      border: none;
      border-bottom: 1px solid var(--panel-border);
      text-align: left;
      padding: 0.35rem 0.6rem;
    }
    .menu button:last-child {
      border-bottom: none;
    }
    .zoom .pct {
      min-width: 3.2rem;
    }
    .conn {
      font-size: 0.75rem;
      color: var(--danger);
      white-space: nowrap;
    }
    .conn.on {
      color: var(--ok);
    }
    .grid-stack {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
    }
    ::ng-deep .grid-stack > .grid-stack-item > .grid-stack-item-content {
      overflow: hidden;
      display: flex;
    }
  `,
})
export class Dashboard implements AfterViewInit, OnDestroy {
  protected readonly ws = inject(WsService);
  protected readonly fontScale = inject(FontScaleService);
  protected readonly theme = inject(ThemeService);
  private readonly appRef = inject(ApplicationRef);
  private readonly envInjector = inject(EnvironmentInjector);
  protected readonly Math = Math;

  private readonly gridEl = viewChild.required<ElementRef<HTMLElement>>('gridEl');
  private grid?: GridStack;
  /** Live mounted widgets, keyed by panel id. */
  private readonly mounted = new Map<
    PanelId,
    { el: GridItemHTMLElement; ref: ComponentRef<PanelHost> }
  >();
  /** Suppress persistence while we programmatically (re)build the grid. */
  private loading = false;
  private readonly onResize = () => this.grid?.cellHeight(this.cellHeight());

  protected readonly views = signal<DashboardView[]>([]);
  protected readonly activeName = signal<string>('Default');
  protected readonly visible = signal<PanelId[]>([]);
  protected readonly menuOpen = signal(false);

  /** Registered panels not currently shown — the add menu. */
  protected readonly hidden = computed(() =>
    PANELS.filter((p) => !this.visible().includes(p.id)),
  );

  constructor() {
    const { views, active } = this.loadPersisted();
    this.views.set(views);
    this.activeName.set(active);
  }

  ngAfterViewInit(): void {
    this.grid = GridStack.init(
      { column: COLUMNS, margin: 8, cellHeight: 80, handle: 'header', float: true },
      this.gridEl().nativeElement,
    );
    this.grid.on('change added removed', () => {
      if (this.loading) return;
      this.persist();
      this.grid!.cellHeight(this.cellHeight());
    });
    this.applyView(this.activeView());
    window.addEventListener('resize', this.onResize);
  }

  ngOnDestroy(): void {
    window.removeEventListener('resize', this.onResize);
    this.clearWidgets();
    this.grid?.destroy(false);
  }

  // ── Views ────────────────────────────────────────────────────────────────

  private activeView(): DashboardView {
    return this.views().find((v) => v.name === this.activeName()) ?? this.views()[0]!;
  }

  protected switchView(name: string): void {
    if (name === this.activeName()) return;
    this.activeName.set(name);
    this.applyView(this.activeView());
    this.writeStorage();
  }

  protected saveViewAs(): void {
    const name = window.prompt('Save current layout as view:')?.trim();
    if (!name) return;
    const panels = this.currentPanels();
    this.views.update((vs) => [...vs.filter((v) => v.name !== name), { name, panels }]);
    this.activeName.set(name);
    this.writeStorage();
  }

  protected renameView(): void {
    const old = this.activeName();
    const name = window.prompt('Rename view:', old)?.trim();
    if (!name || name === old) return;
    this.views.update((vs) =>
      vs.map((v) => (v.name === old ? { ...v, name } : v)).filter((v, i, a) => a.findIndex((x) => x.name === v.name) === i),
    );
    this.activeName.set(name);
    this.writeStorage();
  }

  protected deleteView(): void {
    if (this.views().length <= 1) return;
    const name = this.activeName();
    this.views.update((vs) => vs.filter((v) => v.name !== name));
    this.activeName.set(this.views()[0]!.name);
    this.applyView(this.activeView());
    this.writeStorage();
  }

  protected resetView(): void {
    const panels = defaultView().panels;
    this.views.update((vs) =>
      vs.map((v) => (v.name === this.activeName() ? { ...v, panels } : v)),
    );
    this.applyView(this.activeView());
    this.writeStorage();
  }

  // ── Panels ─────────────────────────────────────────────────────────────────

  protected addPanel(id: PanelId): void {
    this.menuOpen.set(false);
    if (this.mounted.has(id)) return;
    this.mountWidget({ id, ...PANEL_MAP[id].defaultBox }, true);
    this.persist();
    this.grid?.cellHeight(this.cellHeight());
  }

  private hidePanel(id: PanelId): void {
    const w = this.mounted.get(id);
    if (!w || !this.grid) return;
    this.mounted.delete(id);
    this.visible.set([...this.mounted.keys()]);
    this.grid.removeWidget(w.el, true);
    this.appRef.detachView(w.ref.hostView);
    w.ref.destroy();
    this.persist();
    this.grid.cellHeight(this.cellHeight());
  }

  /** Create a gridstack widget and mount a PanelHost component inside it. */
  private mountWidget(box: PanelBox, autoPosition: boolean): void {
    const grid = this.grid!;

    // Build the widget DOM and render the panel (incl. its <header>) BEFORE
    // handing it to gridstack. gridstack resolves the drag `handle: 'header'`
    // selector when it wires up dragging in makeWidget(); if the header isn't
    // in the DOM yet, no handle is found and the whole panel becomes draggable
    // (so selecting text in the body would move the panel).
    const itemEl = document.createElement('div');
    itemEl.className = 'grid-stack-item';
    const content = document.createElement('div');
    content.className = 'grid-stack-item-content';
    itemEl.appendChild(content);

    const ref = createComponent(PanelHost, { environmentInjector: this.envInjector });
    ref.setInput('id', box.id);
    ref.instance.close.subscribe(() => this.hidePanel(box.id));
    this.appRef.attachView(ref.hostView);
    ref.changeDetectorRef.detectChanges(); // render synchronously so <header> exists
    content.appendChild(ref.location.nativeElement);

    this.gridEl().nativeElement.appendChild(itemEl);
    const el = grid.makeWidget(itemEl, {
      id: box.id,
      w: box.w,
      h: box.h,
      ...(autoPosition ? { autoPosition: true } : { x: box.x, y: box.y }),
    }) as GridItemHTMLElement;

    this.mounted.set(box.id, { el, ref });
    this.visible.set([...this.mounted.keys()]);
  }

  private applyView(view: DashboardView): void {
    if (!this.grid) return;
    this.loading = true;
    this.grid.batchUpdate();
    this.clearWidgets();
    for (const box of view.panels) {
      if (isPanelId(box.id)) this.mountWidget(box, false);
    }
    this.grid.batchUpdate(false);
    this.loading = false;
    this.grid.cellHeight(this.cellHeight());
  }

  private clearWidgets(): void {
    if (!this.grid) return;
    for (const { el, ref } of this.mounted.values()) {
      this.grid.removeWidget(el, true);
      this.appRef.detachView(ref.hostView);
      ref.destroy();
    }
    this.mounted.clear();
    this.visible.set([]);
  }

  // ── Persistence ──────────────────────────────────────────────────────────

  /** Current on-screen layout, read from gridstack. */
  private currentPanels(): PanelBox[] {
    const out: PanelBox[] = [];
    for (const n of (this.grid?.save(false) as GridStackNode[]) ?? []) {
      if (isPanelId(n.id)) {
        out.push({ id: n.id, x: n.x ?? 0, y: n.y ?? 0, w: n.w ?? 1, h: n.h ?? 1 });
      }
    }
    return out;
  }

  /** Write the live layout back into the active view, then storage. */
  private persist(): void {
    const panels = this.currentPanels();
    this.views.update((vs) =>
      vs.map((v) => (v.name === this.activeName() ? { ...v, panels } : v)),
    );
    this.writeStorage();
  }

  private writeStorage(): void {
    const data: Persisted = { views: this.views(), active: this.activeName() };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      /* storage full / unavailable — ignore */
    }
  }

  private loadPersisted(): Persisted {
    const fallback: Persisted = { views: [defaultView()], active: 'Default' };
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return fallback;
      const data = JSON.parse(raw) as Persisted;
      const views = (data.views ?? [])
        .filter((v) => v && typeof v.name === 'string' && Array.isArray(v.panels))
        .map((v) => ({
          name: v.name,
          panels: v.panels.filter(
            (p) => isPanelId(p.id) && [p.x, p.y, p.w, p.h].every((n) => typeof n === 'number'),
          ),
        }));
      if (views.length === 0) return fallback;
      const active = views.some((v) => v.name === data.active) ? data.active : views[0]!.name;
      return { views, active };
    } catch {
      return fallback;
    }
  }

  private cellHeight(): number {
    const panels = this.currentPanels();
    const rows = Math.max(8, ...panels.map((b) => b.y + b.h));
    const h = this.gridEl().nativeElement.clientHeight;
    return Math.max(48, Math.floor(h / rows));
  }
}
