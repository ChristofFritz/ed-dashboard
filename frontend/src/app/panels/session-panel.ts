import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { WsService } from '../core/ws.service';
import { CreditsPipe, NumPipe } from '../core/format';

@Component({
  selector: 'ed-session-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CreditsPipe, NumPipe],
  template: `
    @if (ws.commander(); as cmdr) {
      <div class="head">
        <div>
          <div class="cmdr">CMDR {{ cmdr.name ?? '—' }}</div>
          <div class="ship">
            {{ cmdr.shipName ?? cmdr.ship ?? '—' }}
            @if (cmdr.shipIdent) {
              <span class="dim">[{{ cmdr.shipIdent }}]</span>
            }
          </div>
        </div>
        <div class="credits">{{ cmdr.credits | credits }}</div>
      </div>

      <div class="loc">
        <span class="label">LOCATION</span>
        <span>
          {{ cmdr.systemName ?? '—' }}
          @if (cmdr.station) {
            <span class="dim">· {{ cmdr.station }}</span>
          } @else if (cmdr.body) {
            <span class="dim">· {{ cmdr.body }}</span>
          }
          @if (cmdr.docked) {
            <span class="ok">DOCKED</span>
          }
        </span>
      </div>

      <div class="bars">
        @if (cmdr.fuel; as fuel) {
          <div class="bar-row">
            <span class="label">FUEL</span>
            <div class="bar">
              <div
                class="fill"
                [class.warn]="fuel.capacity && fuel.main / fuel.capacity < 0.25"
                [style.width.%]="fuel.capacity ? (fuel.main / fuel.capacity) * 100 : 0"
              ></div>
            </div>
            <span class="dim">{{ fuel.main | num: 1 }}t</span>
          </div>
        }
        @if (cmdr.pips; as pips) {
          <div class="bar-row">
            <span class="label">PIPS</span>
            <span class="pips">
              SYS {{ pips[0] / 2 }} · ENG {{ pips[1] / 2 }} · WEP {{ pips[2] / 2 }}
            </span>
            @if (cmdr.legalState && cmdr.legalState !== 'Clean') {
              <span class="danger">{{ cmdr.legalState }}</span>
            }
          </div>
        }
      </div>
    }

    @if (ws.session(); as session) {
      <h3>SESSION</h3>
      <div class="stats">
        <div class="stat">
          <span class="value accent">{{ session.earnings.total | credits }}</span>
          <span class="label">EARNED</span>
        </div>
        <div class="stat">
          <span class="value">{{ session.jumps | num }}</span>
          <span class="label">JUMPS · {{ session.distanceJumpedLy | num }} LY</span>
        </div>
        <div class="stat">
          <span class="value">{{ session.bodiesScanned | num }}</span>
          <span class="label">SCANNED · {{ session.bodiesMapped | num }} MAPPED</span>
        </div>
      </div>
      <div class="earnings">
        @for (row of earningRows(); track row.label) {
          @if (row.value > 0) {
            <div class="earning-row">
              <span class="label">{{ row.label }}</span>
              <span>{{ row.value | credits }}</span>
            </div>
          }
        }
      </div>
    }
  `,
  styles: `
    .head {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 0.6rem;
    }
    .cmdr {
      font-size: 1.05rem;
      letter-spacing: 0.08em;
    }
    .ship {
      color: var(--text-dim);
      font-size: 0.85rem;
    }
    .credits {
      font-size: 1.3rem;
      color: var(--accent);
    }
    .label {
      color: var(--text-dim);
      font-size: 0.7rem;
      letter-spacing: 0.1em;
    }
    .loc {
      display: flex;
      gap: 0.8rem;
      align-items: baseline;
      padding: 0.15rem 0;
    }
    .loc .label {
      min-width: 4.5rem;
    }
    .dim {
      color: var(--text-dim);
    }
    .ok {
      color: var(--ok);
      font-size: 0.7rem;
      margin-left: 0.5rem;
    }
    .danger {
      color: var(--danger);
    }
    .bars {
      margin-top: 0.5rem;
    }
    .bar-row {
      display: flex;
      align-items: center;
      gap: 0.8rem;
      padding: 0.15rem 0;
    }
    .bar-row .label {
      min-width: 4.5rem;
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
    .fill.warn {
      background: var(--warn);
    }
    h3 {
      margin: 0.9rem 0 0.4rem;
      font-size: 0.7rem;
      color: var(--text-dim);
      border-top: 1px solid var(--panel-border);
      padding-top: 0.6rem;
    }
    .stats {
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
    .value.accent {
      color: var(--accent);
    }
    .earning-row {
      display: flex;
      justify-content: space-between;
      padding: 0.1rem 0;
      font-size: 0.85rem;
    }
  `,
})
export class SessionPanel {
  protected readonly ws = inject(WsService);

  protected readonly earningRows = computed(() => {
    const e = this.ws.session()?.earnings;
    if (!e) return [];
    return [
      { label: 'BOUNTIES', value: e.bounties },
      { label: 'EXPLORATION', value: e.explorationSold },
      { label: 'EXOBIOLOGY', value: e.exobiologySold },
      { label: 'TRADE', value: e.tradeSales },
      { label: 'MISSIONS', value: e.missions },
      { label: 'VOUCHERS', value: e.vouchers },
    ];
  });
}
