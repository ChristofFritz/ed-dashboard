import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import type { ColonisationProject } from '@ed/shared';
import { WsService } from '../core/ws.service';
import { ConfirmService } from '../core/confirm.service';
import { NumPipe } from '../core/format';

/** Fleet carrier cargo capacity in tons. */
const CARRIER_CAP = 25_000;

const PAD_RANK: Record<string, number> = { S: 1, M: 2, L: 3 };
const PAD_LETTER: Record<number, 'S' | 'M' | 'L'> = { 1: 'S', 2: 'M', 3: 'L' };

/** Largest landing pad each ship needs (by internal id): 1=S, 2=M, 3=L. */
const SHIP_PAD: Record<string, 1 | 2 | 3> = {
  // Small
  sidewinder: 1, eagle: 1, hauler: 1, adder: 1, empire_eagle: 1, viper: 1,
  viper_mkiv: 1, cobramkiii: 1, cobramkiv: 1, cobramkv: 1, diamondback: 1,
  diamondbackxl: 1, vulture: 1, dolphin: 1, empire_courier: 1,
  // Medium
  asp: 2, asp_scout: 2, type6: 2, independant_trader: 2, federation_dropship: 2,
  federation_dropship_mkii: 2, federation_gunship: 2, ferdelance: 2, mamba: 2,
  python: 2, python_nx: 2, krait_mkii: 2, krait_light: 2, typex: 2, typex_2: 2,
  typex_3: 2, mandalay: 2,
  // Large
  anaconda: 3, federation_corvette: 3, cutter: 3, empire_trader: 3, type7: 3,
  type8: 3, type9: 3, type9_military: 3, belugaliner: 3, orca: 3,
};

interface Row {
  name: string;
  locName: string;
  need: number; // required - provided
  onCarrier: number;
  onShip: number;
  shortfall: number; // need - carrier - ship, clamped
  pct: number; // provided / required
  /** Ship-loads to ferry `need`; null when capacity is unknown or 0 (no hold). */
  trips: number | null;
}

interface BuyRow {
  name: string;
  locName: string;
  need: number; // summed across incomplete projects
  onCarrier: number;
  buy: number; // need - onCarrier, clamped
}

interface Source {
  station: string;
  system: string;
  distanceLy: number;
  buyPrice: number;
  supply: number;
  padSize: string | null;
  updatedDaysAgo: number | null;
}

interface StopStation {
  station: string;
  system: string;
  distanceLy: number;
  padSize: string | null;
  stationType: string | null;
  items: { commodity: string; buyPrice: number; supply: number }[];
}

/** ?colview=buy|all|project deep-links the initial colonisation view. */
function initialView(): 'project' | 'all' | 'buy' {
  const v = new URLSearchParams(location.search).get('colview');
  return v === 'buy' || v === 'all' ? v : 'project';
}

@Component({
  selector: 'ed-colonisation-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NumPipe, NgTemplateOutlet],
  template: `
    @let col = ws.colonisation();
    @if (!col || col.projects.length === 0) {
      <p class="dim">
        No colonisation projects seen yet. Dock at a construction site — its material
        list is read automatically.
      </p>
    } @else {
      <div class="tabs">
        @for (p of projects(); track p.marketId) {
          <button
            class="tab"
            [class.on]="view() === 'project' && selected()?.marketId === p.marketId"
            [class.done]="p.complete"
            (click)="selectProject(p.marketId)"
            [title]="(p.systemName || '') + ' · ' + tons(p) + ' t remaining'"
          >
            {{ short(p.stationName) }}
            <span class="pctbadge">{{ p.complete ? '✓' : (p.progress * 100).toFixed(0) + '%' }}</span>
          </button>
        }
        <span class="spacer"></span>
        <button class="tab buy" [class.on]="view() === 'all'" (click)="view.set('all')">
          ALL PROJECTS
        </button>
        <button class="tab buy" [class.on]="view() === 'buy'" (click)="view.set('buy')">
          BUY LIST
        </button>
      </div>

      @if (view() === 'buy') {
        @let buy = buyList();
        <div class="capline dim">
          Carrier {{ carrierTons() | num }} / {{ CARRIER_CAP | num }} t ·
          free {{ carrierFree() | num }} t · to&nbsp;buy {{ buyTotal() | num }} t
          @if (buyTotal() > carrierFree()) {
            <span class="warn">· needs {{ trips() }} carrier trips</span>
          }
          <button
            class="src"
            (click)="fitPadOnly.set(!fitPadOnly())"
            title="Toggle landing-pad filter for the current ship"
          >
            pads:
            {{ fitPadOnly() ? (shipPadLetter() ? 'fits ' + shipPadLetter() : 'fit') : 'all' }}
          </button>
          <button
            class="src stopbtn"
            (click)="loadBestStops()"
            [disabled]="loadingStops() || buy.length === 0"
            title="Find stations selling the most of these at one place"
          >
            {{ loadingStops() ? 'searching…' : '⌖ best one-stop shops' }}
          </button>
        </div>
        @if (bestStops() !== null) {
          @let stops = visibleStops() ?? [];
          <div class="stops">
            @if (bestStops()!.length === 0) {
              <span class="dim">no stops found near {{ refSystem() }}</span>
            } @else if (stops.length === 0) {
              <span class="dim">no stops fit your {{ shipPadLetter() }}-pad ship — try "pads: all"</span>
            } @else {
              @for (st of stops; track st.system + '::' + st.station) {
                <div class="stop">
                  <span class="cover" [class.full]="st.items.length === buy.length">
                    {{ st.items.length }}/{{ buy.length }}
                  </span>
                  <div class="stopbody">
                    <div class="stophead">
                      <span class="pad" [title]="'largest pad'">{{ st.padSize ?? '?' }}</span>
                      <span class="sname">{{ st.station }} <em>{{ st.system }}</em></span>
                      <span class="sdist dim">{{ st.distanceLy | num: 1 }} ly</span>
                    </div>
                    <div class="chips">
                      @for (it of st.items; track it.commodity) {
                        <span
                          class="chip"
                          [title]="(it.buyPrice | num) + ' cr · ' + (it.supply | num) + ' t supply'"
                        >
                          {{ it.commodity }}
                        </span>
                      }
                    </div>
                  </div>
                </div>
              }
            }
          </div>
        }
        @if (dockedMarketMap()) {
          <div class="capline here">
            ● Docked at {{ dockedStationName() }} — {{ hereAvailableCount() }} of {{ buy.length }}
            buy-list items sold here
            <button class="src" (click)="hereOnly.set(!hereOnly())">
              {{ hereOnly() ? 'here only' : 'showing all' }}
            </button>
          </div>
        }
        @if (buy.length === 0) {
          <p class="dim">Everything still needed is already on the carrier. 🎉</p>
        } @else {
          @let vbuy = visibleBuy();
          <div class="bhead dim">
            <span class="h-name">Commodity</span>
            <span>To&nbsp;Buy</span>
            <span>Source</span>
          </div>
          <div class="rows">
            @if (vbuy.length === 0) {
              <p class="dim">
                None of your {{ buy.length }} buy-list items are sold at {{ dockedStationName() }}.
              </p>
            }
            @for (r of vbuy; track r.name) {
              <div class="brow">
                <span class="cname"
                  >{{ r.locName }}
                  @if (localHere(r.name); as hi) {
                    <span class="herechip" [title]="'for sale at ' + dockedStationName()"
                      >{{ hi.stock | num }} t @ {{ hi.buyPrice | num }} cr</span
                    >
                  }
                </span>
                <span class="need">buy {{ r.buy | num }} t</span>
                <button
                  class="src"
                  (click)="loadSources(r.locName)"
                  [disabled]="sourcing() === r.locName"
                  title="Find nearest sellers (Spansh)"
                >
                  {{ sourcing() === r.locName ? '…' : 'buy where?' }}
                </button>
              </div>
              @if (sources()[r.locName]; as list) {
                @let vis = visibleSources(list);
                <div class="sources">
                  @if (list.length === 0) {
                    <span class="dim">no sellers found near {{ refSystem() }}</span>
                  } @else if (vis.length === 0) {
                    <span class="dim">none fit your {{ shipPadLetter() }}-pad ship — try "pads: all"</span>
                  } @else {
                    @for (s of vis; track s.station) {
                      <div class="srow dim">
                        <span class="pad" [title]="'largest pad'">{{ s.padSize ?? '?' }}</span>
                        <span class="sdist">{{ s.distanceLy | num: 1 }} ly</span>
                        <span class="sname" [title]="s.station + ' · ' + s.system"
                          >{{ s.station }} <em>{{ s.system }}</em></span
                        >
                        <span class="sbuy">{{ s.buyPrice | num }} cr</span>
                        <span class="ssup">{{ s.supply | num }} t</span>
                      </div>
                    }
                  }
                </div>
              }
            }
          </div>
        }
      } @else if (view() === 'all') {
        <div class="capline dim">
          {{ incompleteCount() }} active {{ incompleteCount() === 1 ? 'project' : 'projects' }} ·
          {{ allNeedTons() | num }} t remaining
          <ng-container
            [ngTemplateOutlet]="shipSum"
            [ngTemplateOutletContext]="{ $implicit: allNeedTons() }"
          />
        </div>
        <ng-container
          [ngTemplateOutlet]="matTable"
          [ngTemplateOutletContext]="{ $implicit: allRows(), deliverActive: false }"
        />
      } @else {
        @let p = selected();
        @if (p) {
          <div class="capline dim">
            {{ p.systemName }} · {{ tons(p) | num }} t remaining · {{ payout(p) | num }} cr payout
            <ng-container
              [ngTemplateOutlet]="shipSum"
              [ngTemplateOutletContext]="{ $implicit: tons(p) }"
            />
            @if (p.marketId === col.activeMarketId) {
              <span class="here">● DOCKED HERE — unload below</span>
            }
            <button class="src del" (click)="deleteProject(p)" title="Delete this project">
              delete
            </button>
          </div>
          <ng-container
            [ngTemplateOutlet]="matTable"
            [ngTemplateOutletContext]="{ $implicit: rows(), deliverActive: p.marketId === col.activeMarketId }"
          />
        }
      }
    }

    <ng-template #shipSum let-tons>
      @if (shipCapacity() === null) {
        · <span class="warn">ship cargo size unknown</span>
      } @else if (shipCapacity() === 0) {
        · <span class="warn">current ship has no cargo hold</span>
      } @else {
        · {{ tripsFor(tons) | num }} ship {{ tripsFor(tons) === 1 ? 'trip' : 'trips' }}
        ({{ shipCapacity() | num }} t/load)
      }
    </ng-template>

    <ng-template #matTable let-rows let-deliverActive="deliverActive">
      <div class="thead dim">
        <span class="h-name">Commodity</span>
        <span></span>
        <span>Need</span>
        <span>Carrier</span>
        <span>Ship</span>
        <span>To&nbsp;Buy</span>
        <span title="Ship-loads to ferry the remaining tonnage">Trips</span>
      </div>
      <div class="rows">
        @for (r of rows; track r.name) {
          <div
            class="row"
            [class.done]="r.need === 0"
            [class.deliver]="deliverActive && r.onShip > 0 && r.need > 0"
          >
            <span class="cname">{{ r.locName }}</span>
            <span class="bar"><span class="fill" [style.width.%]="r.pct * 100"></span></span>
            <span class="need" title="still needed">{{ r.need | num }}</span>
            <span class="have" [class.ok]="r.onCarrier > 0" title="on carrier">{{ r.onCarrier | num }}</span>
            <span class="have" [class.ok]="r.onShip > 0" title="on ship">{{ r.onShip | num }}</span>
            <span class="short" [class.zero]="r.shortfall === 0" title="still to acquire">{{ r.shortfall | num }}</span>
            <span class="trips" title="ship trips for this material">{{ r.trips ?? '—' }}</span>
          </div>
        }
      </div>
    </ng-template>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
      font-size: 0.85rem;
    }
    .dim {
      color: var(--text-dim);
    }
    .warn {
      color: var(--warn);
    }
    .tabs {
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem;
      align-items: center;
    }
    .tab {
      background: none;
      border: 1px solid var(--panel-border);
      color: var(--text-dim);
      font-family: var(--font);
      font-size: 0.7rem;
      padding: 0.15rem 0.4rem;
      cursor: pointer;
      display: flex;
      gap: 0.3rem;
      align-items: center;
    }
    .tab:hover {
      color: var(--accent);
      border-color: var(--accent-dim);
    }
    .tab.on {
      color: var(--accent);
      border-color: var(--accent);
    }
    .tab.done {
      opacity: 0.55;
    }
    .tab .pctbadge {
      font-variant-numeric: tabular-nums;
      color: var(--text-dim);
    }
    .tab.buy {
      letter-spacing: 0.05em;
    }
    .spacer {
      flex: 1;
    }
    .capline {
      font-size: 0.7rem;
      margin: 0.35rem 0 0.25rem;
    }
    .here {
      color: var(--ok);
      margin-left: 0.3rem;
    }
    .capline.here {
      margin-left: 0;
    }
    .herechip {
      font-size: 0.65rem;
      color: var(--ok);
      border: 1px solid color-mix(in srgb, var(--ok) 40%, transparent);
      padding: 0 0.25rem;
      margin-left: 0.35rem;
      white-space: nowrap;
    }
    .rows {
      overflow-y: auto;
      flex: 1;
      min-height: 0;
    }
    .row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 3rem 3rem 3rem 3rem 3rem 2.5rem;
      align-items: center;
      gap: 0.3rem;
      padding: 0.08rem 0;
      font-variant-numeric: tabular-nums;
    }
    .row.done {
      opacity: 0.4;
    }
    .row.deliver .cname {
      color: var(--ok);
    }
    .cname {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .bar {
      grid-column: auto;
      height: 0.5rem;
      background: var(--panel-border);
      position: relative;
      overflow: hidden;
    }
    .bar .fill {
      position: absolute;
      inset: 0 auto 0 0;
      background: var(--accent-dim);
    }
    .need {
      text-align: right;
      color: var(--text);
    }
    .have {
      text-align: right;
      color: var(--text-dim);
    }
    .have.ok {
      color: var(--accent);
    }
    .short {
      text-align: right;
      color: var(--warn);
    }
    .short.zero {
      color: var(--ok);
    }
    .trips {
      text-align: right;
      color: var(--text-dim);
    }
    .thead,
    .bhead {
      display: grid;
      gap: 0.3rem;
      font-size: 0.6rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      border-bottom: 1px solid var(--panel-border);
      padding-bottom: 0.2rem;
      margin-bottom: 0.15rem;
    }
    .thead {
      grid-template-columns: minmax(0, 1fr) 3rem 3rem 3rem 3rem 3rem 2.5rem;
    }
    .bhead {
      grid-template-columns: minmax(0, 1fr) 5rem 5rem;
    }
    .thead span,
    .bhead span {
      text-align: right;
    }
    .thead .h-name,
    .bhead .h-name {
      text-align: left;
    }
    .brow {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 5rem 5rem;
      align-items: center;
      gap: 0.3rem;
      padding: 0.1rem 0;
    }
    .brow .need {
      color: var(--warn);
      font-variant-numeric: tabular-nums;
    }
    .src {
      background: none;
      border: 1px solid var(--panel-border);
      color: var(--text-dim);
      font-family: var(--font);
      font-size: 0.65rem;
      cursor: pointer;
      padding: 0.05rem 0.3rem;
    }
    .src:hover:not(:disabled) {
      color: var(--accent);
      border-color: var(--accent-dim);
    }
    .sources {
      margin: 0 0 0.3rem 0.5rem;
      border-left: 1px solid var(--panel-border);
      padding-left: 0.4rem;
    }
    .srow {
      display: grid;
      grid-template-columns: 1.4rem 3.5rem minmax(0, 1fr) 4.5rem 5rem;
      gap: 0.3rem;
      align-items: baseline;
      font-size: 0.7rem;
      font-variant-numeric: tabular-nums;
    }
    .pad {
      flex: none;
      font-size: 0.6rem;
      text-align: center;
      color: var(--text-dim);
      border: 1px solid var(--panel-border);
      padding: 0 0.15rem;
      min-width: 1.1rem;
    }
    .sname {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .sname em {
      color: var(--text-dim);
      font-style: normal;
      opacity: 0.7;
    }
    .sbuy,
    .ssup,
    .sdist {
      text-align: right;
    }
    .stopbtn {
      margin-left: 0.5rem;
    }
    .del {
      margin-left: 0.5rem;
    }
    .del:hover:not(:disabled) {
      color: var(--danger);
      border-color: var(--danger);
    }
    .stops {
      max-height: 45%;
      overflow-y: auto;
      border-bottom: 1px solid var(--panel-border);
      margin-bottom: 0.3rem;
      padding-bottom: 0.3rem;
    }
    .stop {
      display: flex;
      gap: 0.4rem;
      padding: 0.2rem 0;
      align-items: baseline;
    }
    .cover {
      flex: none;
      font-variant-numeric: tabular-nums;
      font-size: 0.7rem;
      color: var(--text-dim);
      border: 1px solid var(--panel-border);
      padding: 0 0.25rem;
      min-width: 2.6rem;
      text-align: center;
    }
    .cover.full {
      color: var(--ok);
      border-color: var(--ok);
    }
    .stopbody {
      flex: 1;
      min-width: 0;
    }
    .stophead {
      display: flex;
      gap: 0.4rem;
      align-items: baseline;
    }
    .stophead .sname {
      flex: 1;
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 0.2rem;
      margin-top: 0.15rem;
    }
    .chip {
      font-size: 0.65rem;
      color: var(--text-dim);
      background: color-mix(in srgb, var(--accent) 10%, transparent);
      border: 1px solid var(--panel-border);
      padding: 0 0.3rem;
      white-space: nowrap;
    }
  `,
})
export class ColonisationPanel {
  protected readonly ws = inject(WsService);
  private readonly confirm = inject(ConfirmService);
  protected readonly CARRIER_CAP = CARRIER_CAP;

  protected readonly view = signal<'project' | 'all' | 'buy'>(initialView());
  private readonly selectedId = signal<number | null>(null);
  protected readonly sourcing = signal<string | null>(null);
  protected readonly sources = signal<Record<string, Source[]>>({});
  protected readonly bestStops = signal<StopStation[] | null>(null);
  protected readonly loadingStops = signal(false);
  /** When true, hide stations whose largest pad can't fit the current ship. */
  protected readonly fitPadOnly = signal(true);

  /** Largest pad the current ship needs (1=S,2=M,3=L), or null if unknown. */
  protected readonly shipPadRank = computed<number | null>(() => {
    const s = this.ws.commander()?.shipInternal;
    return s ? (SHIP_PAD[s] ?? null) : null;
  });
  protected readonly shipPadLetter = computed(() => {
    const r = this.shipPadRank();
    return r ? PAD_LETTER[r] : null;
  });

  /** Does a station with `pad` fit the current ship, under the active filter? */
  protected padFits(pad: string | null): boolean {
    if (!this.fitPadOnly()) return true;
    const need = this.shipPadRank();
    if (need == null || pad == null) return true; // unknown → don't hide
    return (PAD_RANK[pad] ?? 0) >= need;
  }

  protected visibleSources(list: Source[]): Source[] {
    return list.filter((s) => this.padFits(s.padSize));
  }
  protected readonly visibleStops = computed<StopStation[] | null>(() => {
    const stops = this.bestStops();
    return stops ? stops.filter((s) => this.padFits(s.padSize)) : stops;
  });

  protected readonly projects = computed<ColonisationProject[]>(() => {
    const ps = this.ws.colonisation()?.projects ?? [];
    // Incomplete first, then by tons remaining desc.
    return [...ps].sort(
      (a, b) => Number(a.complete) - Number(b.complete) || this.tons(b) - this.tons(a),
    );
  });

  protected readonly selected = computed<ColonisationProject | null>(() => {
    const ps = this.projects();
    if (ps.length === 0) return null;
    const id = this.selectedId() ?? this.ws.colonisation()?.activeMarketId ?? null;
    return (
      ps.find((p) => p.marketId === id) ?? ps.find((p) => !p.complete && !p.failed) ?? ps[0]!
    );
  });

  private carrierMap(): Map<string, number> {
    // cAPI reports commodity ids capitalised ("Liquidoxygen"); depot/ship ids
    // are lowercase — normalise so the join lands.
    const m = new Map<string, number>();
    for (const c of this.ws.carrier()?.cargo ?? []) m.set(c.name.toLowerCase(), c.tons);
    return m;
  }
  private shipMap(): Map<string, number> {
    const m = new Map<string, number>();
    for (const s of this.ws.colonisation()?.shipCargo ?? []) m.set(s.name, s.tons);
    return m;
  }

  /** Ship cargo capacity in tons: number (0 = no hold), or null if unknown. */
  protected readonly shipCapacity = computed<number | null>(
    () => this.ws.colonisation()?.shipCapacity ?? null,
  );

  /** Ship-loads to move `tons`; null when capacity is unknown or 0. */
  protected tripsFor(tons: number): number | null {
    if (tons <= 0) return 0;
    const cap = this.shipCapacity();
    return cap && cap > 0 ? Math.ceil(tons / cap) : null;
  }

  protected readonly rows = computed<Row[]>(() => {
    const p = this.selected();
    if (!p) return [];
    const carrier = this.carrierMap();
    const ship = this.shipMap();
    return p.commodities
      .map((c) => {
        const need = Math.max(0, c.required - c.provided);
        const onCarrier = carrier.get(c.name) ?? 0;
        const onShip = ship.get(c.name) ?? 0;
        return {
          name: c.name,
          locName: c.locName,
          need,
          onCarrier,
          onShip,
          shortfall: Math.max(0, need - onCarrier - onShip),
          pct: c.required > 0 ? Math.min(1, c.provided / c.required) : 1,
          trips: this.tripsFor(need),
        };
      })
      .sort((a, b) => Number(a.need === 0) - Number(b.need === 0) || b.need - a.need);
  });

  /** Aggregate across all incomplete projects — the "All projects" view. */
  protected readonly allRows = computed<Row[]>(() => {
    const carrier = this.carrierMap();
    const ship = this.shipMap();
    const agg = new Map<string, { locName: string; required: number; provided: number }>();
    for (const p of this.projects()) {
      if (p.complete || p.failed) continue;
      for (const c of p.commodities) {
        const cur = agg.get(c.name) ?? { locName: c.locName, required: 0, provided: 0 };
        cur.required += c.required;
        cur.provided += c.provided;
        agg.set(c.name, cur);
      }
    }
    return [...agg.entries()]
      .map(([name, v]) => {
        const need = Math.max(0, v.required - v.provided);
        const onCarrier = carrier.get(name) ?? 0;
        const onShip = ship.get(name) ?? 0;
        return {
          name,
          locName: v.locName,
          need,
          onCarrier,
          onShip,
          shortfall: Math.max(0, need - onCarrier - onShip),
          pct: v.required > 0 ? Math.min(1, v.provided / v.required) : 1,
          trips: this.tripsFor(need),
        };
      })
      .sort((a, b) => Number(a.need === 0) - Number(b.need === 0) || b.need - a.need);
  });

  protected readonly incompleteCount = computed(
    () => this.projects().filter((p) => !p.complete && !p.failed).length,
  );
  protected readonly allNeedTons = computed(() =>
    this.allRows().reduce((s, r) => s + r.need, 0),
  );

  protected readonly buyList = computed<BuyRow[]>(() => {
    const carrier = this.carrierMap();
    const ship = this.shipMap();
    const need = new Map<string, { locName: string; need: number }>();
    for (const p of this.projects()) {
      if (p.complete || p.failed) continue;
      for (const c of p.commodities) {
        const rem = Math.max(0, c.required - c.provided);
        if (rem === 0) continue;
        const cur = need.get(c.name) ?? { locName: c.locName, need: 0 };
        cur.need += rem;
        need.set(c.name, cur);
      }
    }
    const rows: BuyRow[] = [];
    for (const [name, v] of need) {
      const onCarrier = carrier.get(name) ?? 0;
      // What you already hold anywhere (carrier + ship) doesn't need buying.
      const buy = Math.max(0, v.need - onCarrier - (ship.get(name) ?? 0));
      if (buy > 0) rows.push({ name, locName: v.locName, need: v.need, onCarrier, buy });
    }
    return rows.sort((a, b) => b.buy - a.buy);
  });

  /** For-sale commodities at the currently-docked station, or null if not docked. */
  protected readonly dockedMarketMap = computed<Map<string, { stock: number; buyPrice: number }> | null>(
    () => {
      const dm = this.ws.colonisation()?.dockedMarket;
      if (!dm || !this.ws.commander()?.docked) return null;
      return new Map(dm.items.map((i) => [i.name, { stock: i.stock, buyPrice: i.buyPrice }]));
    },
  );
  protected readonly dockedStationName = computed(
    () => this.ws.colonisation()?.dockedMarket?.stationName ?? null,
  );
  /** When docked, restrict the buy list to what this station actually sells. */
  protected readonly hereOnly = signal(true);
  protected readonly hereAvailableCount = computed(() => {
    const map = this.dockedMarketMap();
    return map ? this.buyList().filter((r) => map.has(r.name)).length : 0;
  });
  protected readonly visibleBuy = computed<BuyRow[]>(() => {
    const buy = this.buyList();
    const map = this.dockedMarketMap();
    return map && this.hereOnly() ? buy.filter((r) => map.has(r.name)) : buy;
  });
  protected localHere(name: string): { stock: number; buyPrice: number } | undefined {
    return this.dockedMarketMap()?.get(name);
  }

  protected readonly carrierTons = computed(() => this.ws.carrier()?.totalTons ?? 0);
  protected readonly carrierFree = computed(() => Math.max(0, CARRIER_CAP - this.carrierTons()));
  protected readonly buyTotal = computed(() => this.buyList().reduce((s, r) => s + r.buy, 0));
  protected readonly trips = computed(() =>
    Math.max(1, Math.ceil(this.buyTotal() / CARRIER_CAP)),
  );
  protected readonly refSystem = computed(() => this.ws.commander()?.systemName ?? '');

  protected selectProject(id: number): void {
    this.selectedId.set(id);
    this.view.set('project');
  }

  protected async deleteProject(p: ColonisationProject): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Delete project',
      message: `Remove "${this.short(p.stationName)}" and its tracked data? It'll reappear if you dock there again.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    // Server drops it from state and persists the dismissal; the WS slice update
    // removes it here. Fall back to selecting another project.
    this.selectedId.set(null);
    await fetch(`/api/colonisation/projects/${p.marketId}/delete`, { method: 'POST' });
  }

  protected tons(p: ColonisationProject): number {
    return p.commodities.reduce((s, c) => s + Math.max(0, c.required - c.provided), 0);
  }
  protected payout(p: ColonisationProject): number {
    return p.commodities.reduce((s, c) => s + Math.max(0, c.required - c.provided) * c.payment, 0);
  }
  protected short(name: string): string {
    return name.replace(/^(Planetary|Space) Construction Site:\s*/i, '');
  }
  protected async loadBestStops(): Promise<void> {
    const system = this.refSystem();
    const commodities = this.buyList().map((r) => r.locName);
    if (!system || commodities.length === 0 || this.loadingStops()) return;
    this.loadingStops.set(true);
    this.bestStops.set(null);
    try {
      const res = await fetch('/api/colonisation/best-stops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commodities, system }),
      });
      const data = (await res.json()) as { stops?: StopStation[] };
      this.bestStops.set(data.stops ?? []);
    } catch {
      this.bestStops.set([]);
    } finally {
      this.loadingStops.set(false);
    }
  }

  protected async loadSources(locName: string): Promise<void> {
    const system = this.refSystem();
    if (!system || this.sourcing()) return;
    this.sourcing.set(locName);
    try {
      const res = await fetch(
        `/api/colonisation/sources?commodity=${encodeURIComponent(locName)}&system=${encodeURIComponent(system)}`,
      );
      const data = (await res.json()) as { sources?: Source[] };
      this.sources.update((m) => ({ ...m, [locName]: data.sources ?? [] }));
    } catch {
      this.sources.update((m) => ({ ...m, [locName]: [] }));
    } finally {
      this.sourcing.set(null);
    }
  }
}
