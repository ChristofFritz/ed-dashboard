import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DatePipe, PercentPipe } from '@angular/common';
import { WsService } from '../core/ws.service';
import { NumPipe } from '../core/format';

@Component({
  selector: 'ed-target-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NumPipe, DatePipe, PercentPipe],
  template: `
    @if (ws.target(); as target) {
      @if (target.current; as t) {
        <div class="target">
          <div class="row1">
            <span class="ship">{{ t.ship }}</span>
            @if (t.bounty) {
              <span class="bounty">{{ t.bounty | num }} CR</span>
            }
          </div>
          <div class="row2">
            @if (t.pilotName) {
              <span>{{ t.pilotName }}</span>
            }
            @if (t.pilotRank) {
              <span class="dim">{{ t.pilotRank }}</span>
            }
            @if (t.legalStatus; as legal) {
              <span class="legal" [class]="legalClass(legal)">{{ legal }}</span>
            }
            @if (t.faction) {
              <span class="dim">· {{ t.faction }}</span>
            }
          </div>
          @if (t.scanStage !== null && t.scanStage < 3) {
            <div class="scanning dim">SCANNING… STAGE {{ t.scanStage }}/3</div>
          }
          @if (t.shieldHealth !== undefined || t.hullHealth !== undefined) {
            <div class="health">
              <div class="bar-row">
                <span class="label">SHD</span>
                <div class="bar">
                  <div class="fill shield" [style.width.%]="t.shieldHealth ?? 0"></div>
                </div>
                <span class="dim">{{ (t.shieldHealth ?? 0) / 100 | percent: '1.0-0' }}</span>
              </div>
              <div class="bar-row">
                <span class="label">HULL</span>
                <div class="bar">
                  <div class="fill hull" [style.width.%]="t.hullHealth ?? 0"></div>
                </div>
                <span class="dim">{{ (t.hullHealth ?? 0) / 100 | percent: '1.0-0' }}</span>
              </div>
              @if (t.subsystem) {
                <div class="dim sub">{{ t.subsystem }} {{ (t.subsystemHealth ?? 0) / 100 | percent: '1.0-0' }}</div>
              }
            </div>
          }
        </div>
      } @else {
        <p class="dim no-target">NO TARGET</p>
      }

      <div class="totals">
        <div class="stat">
          <span class="value accent">{{ target.sessionBountyTotal | num }} CR</span>
          <span class="label">SESSION BOUNTIES</span>
        </div>
        <div class="stat">
          <span class="value">{{ target.sessionKills }}</span>
          <span class="label">KILLS</span>
        </div>
      </div>

      @if (target.recentBounties.length) {
        <div class="ledger">
          @for (b of target.recentBounties; track b.timestamp) {
            <div class="ledger-row">
              <span class="dim">{{ b.timestamp | date: 'HH:mm' }}</span>
              <span class="tname">{{ b.pilotName ?? b.target }}</span>
              <span class="reward">{{ b.reward | num }} CR</span>
            </div>
          }
        </div>
      }
    }
  `,
  styles: `
    .target {
      border: 1px solid var(--panel-border);
      padding: 0.5rem 0.7rem;
      margin-bottom: 0.6rem;
    }
    .row1 {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
    }
    .ship {
      font-size: 1.05rem;
      letter-spacing: 0.05em;
    }
    .bounty {
      color: var(--accent);
      font-size: 1.1rem;
    }
    .row2 {
      display: flex;
      gap: 0.6rem;
      font-size: 0.85rem;
      margin-top: 0.15rem;
    }
    .legal {
      font-weight: 600;
      letter-spacing: 0.05em;
    }
    .legal-danger {
      color: var(--danger);
    }
    .legal-warn {
      color: var(--warn);
    }
    .legal-clean {
      color: var(--ok);
    }
    .legal-neutral {
      color: var(--text-dim);
    }
    .dim {
      color: var(--text-dim);
    }
    .scanning {
      font-size: 0.75rem;
      margin-top: 0.3rem;
    }
    .health {
      margin-top: 0.4rem;
    }
    .bar-row {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      padding: 0.1rem 0;
    }
    .label {
      color: var(--text-dim);
      font-size: 0.65rem;
      min-width: 2.5rem;
      letter-spacing: 0.1em;
    }
    .bar {
      flex: 1;
      height: 7px;
      background: #0a0a0d;
      border: 1px solid var(--panel-border);
    }
    .fill {
      height: 100%;
      transition: width 0.3s;
    }
    .fill.shield {
      background: var(--ok);
    }
    .fill.hull {
      background: var(--danger);
    }
    .sub {
      font-size: 0.75rem;
      margin-top: 0.2rem;
    }
    .no-target {
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
    .value.accent {
      color: var(--accent);
    }
    .ledger {
      border-top: 1px solid var(--panel-border);
      padding-top: 0.4rem;
    }
    .ledger-row {
      display: flex;
      gap: 0.8rem;
      font-size: 0.8rem;
      padding: 0.1rem 0;
    }
    .tname {
      flex: 1;
    }
    .reward {
      color: var(--accent);
    }
  `,
})
export class TargetPanel {
  protected readonly ws = inject(WsService);

  protected legalClass(legal: string): string {
    switch (legal) {
      case 'Wanted':
      case 'WantedEnemy':
      case 'Enemy':
      case 'Hostile':
        return 'legal-danger';
      case 'Warrant':
      case 'Lawless':
      case 'IllegalCargo':
      case 'Speeding':
      case 'PassengerWanted':
        return 'legal-warn';
      case 'Clean':
        return 'legal-clean';
      default:
        return 'legal-neutral';
    }
  }
}
