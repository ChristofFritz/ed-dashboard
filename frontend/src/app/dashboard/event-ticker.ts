import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { WsService } from '../core/ws.service';

@Component({
  selector: 'ed-event-ticker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe],
  template: `
    <div class="ticker" [class.open]="open()">
      <button class="toggle" (click)="open.set(!open())">
        {{ open() ? '▾' : '▴' }} EVENTS
        @if (!open() && ws.recentEvents()[0]; as latest) {
          <span class="latest">{{ latest.event }}</span>
        }
      </button>
      @if (open()) {
        <div class="list">
          @for (ev of ws.recentEvents(); track $index) {
            <div class="row">
              <span class="ts">{{ ev.timestamp | date: 'HH:mm:ss' }}</span>
              <span class="name">{{ ev.event }}</span>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .ticker {
      border-top: 1px solid var(--panel-border);
      background: var(--panel);
    }
    .toggle {
      width: 100%;
      background: none;
      border: none;
      color: var(--accent);
      font-family: var(--font);
      font-size: 0.75rem;
      letter-spacing: 0.12em;
      padding: 0.35rem 0.8rem;
      text-align: left;
      cursor: pointer;
    }
    .latest {
      color: var(--text-dim);
      margin-left: 1rem;
      text-transform: none;
      letter-spacing: normal;
    }
    .list {
      max-height: 180px;
      overflow-y: auto;
      padding: 0 0.8rem 0.5rem;
      font-size: 0.75rem;
    }
    .row {
      display: flex;
      gap: 0.8rem;
      padding: 0.1rem 0;
    }
    .ts {
      color: var(--text-dim);
    }
  `,
})
export class EventTicker {
  protected readonly ws = inject(WsService);
  protected readonly open = signal(false);
}
