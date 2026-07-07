import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { WsService } from '../core/ws.service';
import { NumPipe } from '../core/format';

@Component({
  selector: 'ed-route-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NumPipe],
  template: `
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
    } @else {
      <p class="dim">No route plotted.</p>
    }
  `,
  styles: `
    .label {
      color: var(--text-dim);
      font-size: 0.65rem;
      letter-spacing: 0.1em;
    }
    .dim {
      color: var(--text-dim);
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
  `,
})
export class RoutePanel {
  protected readonly ws = inject(WsService);

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
}
