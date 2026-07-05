import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { WsService } from '../core/ws.service';
import { CreditsPipe, NumPipe } from '../core/format';
import type { BioPredictionInfo, BodyState } from '@ed/shared';

@Component({
  selector: 'ed-exploration-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CreditsPipe, NumPipe],
  template: `
    @if (ws.exploration(); as exp) {
      <div class="sys-head">
        <div>
          <a
            class="sys-name"
            [href]="spanshUrl()"
            target="_blank"
            rel="noopener"
            title="Open on Spansh"
            >{{ exp.systemName ?? '—' }}</a
          >
          <div class="sub">
            @switch (exp.edsm.status) {
              @case ('ok') {
                @if (exp.edsm.knownBodyCount === 0) {
                  <span class="ok">NOT ON EDSM — VIRGIN SYSTEM?</span>
                } @else {
                  <span class="dim">EDSM: {{ exp.edsm.knownBodyCount }} bodies known</span>
                }
              }
              @case ('loading') {
                <span class="dim">EDSM…</span>
              }
              @case ('offline') {
                <span class="warn">EDSM OFFLINE</span>
              }
            }
          </div>
        </div>
        <div class="sys-value">
          <span class="value">{{ exp.systemEstimatedValue | credits }}</span>
          <span class="label">SYSTEM SCAN VALUE</span>
          @if (exp.systemMappedValue > exp.systemEstimatedValue) {
            <span class="value mapped">{{ exp.systemMappedValue | credits }}</span>
            <span class="label">IF ALL MAPPED</span>
          }
        </div>
      </div>

      <div class="fss">
        <span class="label">FSS</span>
        <div class="bar">
          <div class="fill" [style.width.%]="fssPercent()"></div>
        </div>
        <span class="dim">
          {{ exp.scannedCount }}/{{ exp.bodyCount ?? '?' }}
          @if (exp.allBodiesFound) {
            <span class="ok">✓ ALL</span>
          }
        </span>
      </div>

      @if (exp.edsm.interesting.length) {
        <div class="edsm-hl">
          <span class="label">EDSM HIGHLIGHTS · {{ exp.edsm.interesting.length }}</span>
          @for (b of exp.edsm.interesting; track b.name) {
            <div class="hl-row">
              <span class="hl-name">{{ b.shortName }}</span>
              <span class="hl-type" [class.top]="isTopValue(b.subType)">{{ b.subType }}</span>
              @if (b.terraformable) {
                <span class="tag tf">TF</span>
              }
              @if (b.landable) {
                <span class="tag land">LAND</span>
              }
              <span class="hl-dist dim">{{ b.distanceLs | num }} ls</span>
            </div>
          }
        </div>
      }

      @if (routeInfo(); as route) {
        <div class="route">
          <div class="route-head">
            <span class="label">ROUTE</span>
            <span class="route-dest">{{ route.destination }}</span>
            <span class="dim">
              {{ route.remainingJumps }} {{ route.remainingJumps === 1 ? 'jump' : 'jumps' }} ·
              {{ route.remainingLy | num: 1 }} ly left
            </span>
          </div>
          <div class="hops">
            @for (hop of route.hops; track hop.systemAddress) {
              <div class="hop" [class.done]="hop.status === 'done'" [class.current]="hop.status === 'current'">
                <span class="hop-mark">{{ hop.status === 'done' ? '●' : hop.status === 'current' ? '◆' : '○' }}</span>
                <span class="hop-class" [class.scoop]="hop.scoopable" [class.neutron]="hop.starClass === 'N'">
                  {{ hop.starClass }}
                </span>
                <span class="hop-name">{{ hop.name }}</span>
                @if (hop.legLy > 0) {
                  <span class="hop-ly dim">{{ hop.legLy | num: 1 }} ly</span>
                }
              </div>
            }
          </div>
        </div>
      }

      @if (exp.organicInProgress; as org) {
        <div class="organic">
          <span class="label">SAMPLING</span>
          <span>{{ org.species }}</span>
          <span class="samples">
            @for (i of [1, 2, 3]; track i) {
              <span [class.done]="org.samples >= i">●</span>
            }
          </span>
        </div>
      }

      <div class="bodies">
        @for (body of sortedBodies(); track body.bodyId) {
          <div class="body-row" [class.star]="body.isStar">
            <span class="bname">{{ body.shortName }}</span>
            <span class="bclass">
              {{ body.starType ? 'Class ' + body.starType + ' star' : body.planetClass }}
            </span>
            <span class="tags">
              @if (body.terraformable) {
                <span class="tag tf">TF</span>
              }
              @if (!body.wasDiscovered) {
                <span class="tag fd">FIRST</span>
              }
              @if (body.mappedByMe) {
                <span class="tag mapped" [class.eff]="body.mappedEfficiently">DSS</span>
              }
              @if (body.bioSignals; as bio) {
                <span class="tag bio">
                  BIO {{ bio.count }}
                  @if (bio.genuses.length) {
                    · {{ bio.genuses.join(', ') }}
                  }
                </span>
                <!-- Only predict genera once we know the body actually has bio signals. -->
                @if (!bio.genuses.length && body.bioPrediction; as pred) {
                  <span
                    class="tag bio-pred"
                    [title]="pred.candidates.length + ' possible genera · up to ' + (pred.maxValue | credits)"
                  >
                    ≈ {{ predGenuses(pred) }} · {{ pred.maxValue | credits }}
                  </span>
                }
              }
              @if (body.geoSignals) {
                <span class="tag geo">GEO {{ body.geoSignals }}</span>
              }
            </span>
            <span class="dist dim">{{ body.distanceLs | num }} ls</span>
            <span class="bvalue" [class.worth]="isWorthMapping(body)">
              {{ (body.mappedByMe ? body.value.mappedValue : body.value.scanValue) | credits }}
              @if (!body.mappedByMe && !body.isStar && isWorthMapping(body)) {
                <span class="map-hint">→ {{ body.value.mappedValue | credits }}</span>
              }
            </span>
          </div>
        } @empty {
          <p class="dim">No bodies scanned yet.</p>
        }
      </div>

      @if (exp.organicsCompleted.length) {
        <h3>EXOBIOLOGY ({{ exp.organicsCompleted.length }})</h3>
        @for (org of exp.organicsCompleted; track $index) {
          <div class="org-row">
            <span>{{ org.variant ?? org.species }}</span>
            <span class="ok">✓✓✓</span>
          </div>
        }
      }
    }
  `,
  styles: `
    .sys-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 0.5rem;
    }
    .sys-name {
      font-size: 1.05rem;
      letter-spacing: 0.06em;
      color: var(--text);
      text-decoration: none;
      border-bottom: 1px dotted var(--accent-dim);
    }
    .sub {
      font-size: 0.7rem;
      margin-top: 0.2rem;
    }
    .sys-value {
      text-align: right;
      display: flex;
      flex-direction: column;
    }
    .value {
      color: var(--accent);
      font-size: 1.15rem;
    }
    .value.mapped {
      color: var(--ok);
      font-size: 0.95rem;
      margin-top: 0.2rem;
    }
    .label {
      color: var(--text-dim);
      font-size: 0.65rem;
      letter-spacing: 0.1em;
    }
    .dim {
      color: var(--text-dim);
    }
    .ok {
      color: var(--ok);
    }
    .warn {
      color: var(--warn);
    }
    .fss {
      display: flex;
      align-items: center;
      gap: 0.8rem;
      margin-bottom: 0.5rem;
    }
    .bar {
      flex: 1;
      height: 8px;
      background: #0a0a0d;
      border: 1px solid var(--panel-border);
    }
    .fill {
      height: 100%;
      background: var(--accent-dim);
      transition: width 0.5s;
    }
    .route {
      margin-bottom: 0.5rem;
    }
    .route-head {
      display: flex;
      gap: 0.8rem;
      align-items: baseline;
    }
    .route-dest {
      color: var(--accent);
    }
    .hops {
      max-height: 8rem;
      overflow-y: auto;
      margin-top: 0.25rem;
      border-left: 1px solid var(--panel-border);
      padding-left: 0.6rem;
    }
    .hop {
      display: flex;
      gap: 0.5rem;
      align-items: baseline;
      font-size: 0.8rem;
      padding: 0.08rem 0;
      color: var(--text-dim);
    }
    .hop.current {
      color: var(--text);
    }
    .hop.current .hop-name {
      color: var(--accent);
    }
    .hop.done {
      opacity: 0.5;
    }
    .hop-mark {
      font-size: 0.6rem;
    }
    .hop-class {
      min-width: 1.6rem;
      font-size: 0.7rem;
      border: 1px solid var(--panel-border);
      text-align: center;
    }
    .hop-class.scoop {
      color: var(--ok);
      border-color: var(--ok);
    }
    .hop-class.neutron {
      color: var(--warn);
      border-color: var(--warn);
    }
    .hop-name {
      flex: 1;
    }
    .hop-ly {
      font-size: 0.7rem;
    }
    .edsm-hl {
      margin-bottom: 0.5rem;
      border: 1px solid var(--panel-border);
      padding: 0.35rem 0.6rem;
    }
    .hl-row {
      display: flex;
      align-items: baseline;
      gap: 0.5rem;
      padding: 0.1rem 0;
      font-size: 0.82rem;
    }
    .hl-name {
      min-width: 3.5rem;
      font-weight: 600;
    }
    .hl-type {
      color: var(--text-dim);
    }
    .hl-type.top {
      color: var(--ok);
    }
    .hl-dist {
      margin-left: auto;
      font-size: 0.75rem;
    }
    .tag.land {
      color: var(--warn);
      border-color: #6b5a2a;
    }
    .organic {
      display: flex;
      gap: 0.8rem;
      align-items: center;
      padding: 0.3rem 0.5rem;
      border: 1px solid var(--accent-dim);
      margin-bottom: 0.5rem;
    }
    .samples span {
      color: var(--text-dim);
      margin-left: 0.2rem;
    }
    .samples .done {
      color: var(--ok);
    }
    .bodies {
      display: flex;
      flex-direction: column;
    }
    .body-row {
      display: flex;
      align-items: baseline;
      gap: 0.6rem;
      padding: 0.18rem 0;
      border-bottom: 1px solid #1e1e26;
      font-size: 0.85rem;
    }
    .body-row.star .bname {
      color: var(--warn);
    }
    .bname {
      min-width: 3.5rem;
      font-weight: 600;
    }
    .bclass {
      color: var(--text-dim);
      flex-shrink: 1;
    }
    .tags {
      flex: 1;
      display: flex;
      gap: 0.3rem;
      flex-wrap: wrap;
    }
    .tag {
      font-size: 0.65rem;
      padding: 0 0.3rem;
      border: 1px solid var(--panel-border);
      color: var(--text-dim);
    }
    .tag.tf {
      color: var(--ok);
      border-color: var(--ok);
    }
    .tag.fd {
      color: var(--accent);
      border-color: var(--accent);
    }
    .tag.bio {
      color: #7dd87d;
      border-color: #3e6b3e;
    }
    .tag.geo {
      color: var(--warn);
      border-color: #6b5a2a;
    }
    .tag.mapped {
      color: var(--ok);
    }
    .tag.mapped.eff {
      border-color: var(--ok);
    }
    .tag.bio-pred {
      color: #6f9e6f;
      border-style: dashed;
      border-color: #3e6b3e;
    }
    .dist {
      font-size: 0.75rem;
      min-width: 4.5rem;
      text-align: right;
    }
    .bvalue {
      min-width: 7rem;
      text-align: right;
    }
    .bvalue.worth {
      color: var(--accent);
    }
    .map-hint {
      display: block;
      font-size: 0.65rem;
      color: var(--text-dim);
    }
    h3 {
      margin: 0.8rem 0 0.3rem;
      font-size: 0.7rem;
      color: var(--text-dim);
      border-top: 1px solid var(--panel-border);
      padding-top: 0.5rem;
    }
    .org-row {
      display: flex;
      justify-content: space-between;
      font-size: 0.85rem;
      padding: 0.1rem 0;
    }
  `,
})
export class ExplorationPanel {
  protected readonly ws = inject(WsService);

  protected readonly fssPercent = computed(() => {
    const exp = this.ws.exploration();
    if (!exp) return 0;
    if (exp.allBodiesFound) return 100;
    if (exp.bodyCount && exp.scannedCount) {
      return Math.min(100, (exp.scannedCount / exp.bodyCount) * 100);
    }
    return (exp.fssProgress ?? 0) * 100;
  });

  protected readonly sortedBodies = computed(
    () => this.ws.exploration()?.bodies ?? [],
  );

  protected readonly routeInfo = computed(() => {
    const cmdr = this.ws.commander();
    const route = cmdr?.route;
    if (!route || route.hops.length === 0) return null;
    const currentIdx = route.hops.findIndex((h) => h.systemAddress === cmdr.systemAddress);
    let remainingJumps = 0;
    let remainingLy = 0;
    for (let i = Math.max(currentIdx, 0) + 1; i < route.hops.length; i++) {
      remainingJumps++;
      remainingLy += route.hops[i]!.legLy;
    }
    return {
      destination: route.hops.at(-1)!.name,
      remainingJumps,
      remainingLy,
      hops: route.hops.map((h, i) => ({
        ...h,
        status: i < currentIdx ? ('done' as const) : i === currentIdx ? ('current' as const) : ('pending' as const),
      })),
    };
  });

  protected readonly spanshUrl = computed(() => {
    const addr = this.ws.exploration()?.systemAddress;
    return addr ? `https://spansh.co.uk/system/${addr}` : null;
  });

  protected isWorthMapping(body: BodyState): boolean {
    return body.value.mappedValue >= 300_000;
  }

  protected isTopValue(subType: string): boolean {
    return (
      subType.includes('Earth-like') ||
      subType.includes('Water world') ||
      subType.includes('Ammonia world')
    );
  }

  protected predGenuses(pred: BioPredictionInfo): string {
    return pred.candidates
      .slice(0, 3)
      .map((c) => c.genus)
      .join(', ');
  }

}
