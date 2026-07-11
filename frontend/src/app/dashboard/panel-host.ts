import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { WsService } from '../core/ws.service';
import { PanelFrame } from '../shared/panel-frame';
import { ExplorationPanel } from '../panels/exploration-panel';
import { TargetPanel } from '../panels/target-panel';
import { MiningPanel } from '../panels/mining-panel';
import { SessionPanel } from '../panels/session-panel';
import { RoutePanel } from '../panels/route-panel';
import { CarrierPanel } from '../panels/carrier-panel';
import { ColonisationPanel } from '../panels/colonisation-panel';
import { PANEL_MAP, type PanelId } from './panel-registry';

/**
 * Wraps a single dashboard panel in its frame and renders the right panel
 * component for `id`. Created imperatively by the dashboard and mounted into a
 * gridstack widget, so add/hide/views can be fully dynamic.
 */
@Component({
  selector: 'ed-panel-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PanelFrame,
    ExplorationPanel,
    TargetPanel,
    MiningPanel,
    SessionPanel,
    RoutePanel,
    CarrierPanel,
    ColonisationPanel,
  ],
  template: `
    <ed-panel-frame [title]="meta().title" [stale]="stale()" (close)="close.emit()">
      @switch (id()) {
        @case ('exploration') { <ed-exploration-panel /> }
        @case ('target') { <ed-target-panel /> }
        @case ('mining') { <ed-mining-panel /> }
        @case ('session') { <ed-session-panel /> }
        @case ('route') { <ed-route-panel /> }
        @case ('carrier') { <ed-carrier-panel /> }
        @case ('colonisation') { <ed-colonisation-panel /> }
      }
    </ed-panel-frame>
  `,
  styles: `
    :host {
      display: flex;
      flex: 1;
      min-height: 0;
    }
  `,
})
export class PanelHost {
  readonly id = input.required<PanelId>();
  readonly close = output<void>();

  private readonly ws = inject(WsService);
  protected readonly meta = computed(() => PANEL_MAP[this.id()]);
  protected readonly stale = computed(
    () => this.meta().staleAware && (this.ws.commander()?.statusStale ?? false),
  );
}
