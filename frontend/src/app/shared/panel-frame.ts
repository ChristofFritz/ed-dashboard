import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'ed-panel-frame',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="panel" [class.stale]="stale()" [class.pinned]="pinned()">
      <header (click)="headerClick.emit()">
        <h2>{{ title() }}</h2>
        @if (pinned()) {
          <span class="pin" title="Pinned">📌</span>
        }
      </header>
      <div class="body">
        <ng-content />
      </div>
    </section>
  `,
  styles: `
    .panel {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
      background: var(--panel);
      border: 1px solid var(--panel-border);
      transition: opacity 0.3s;
    }
    .panel.stale {
      opacity: 0.55;
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.4rem 0.8rem;
      border-bottom: 1px solid var(--panel-border);
      cursor: pointer;
      user-select: none;
    }
    h2 {
      margin: 0;
      font-size: 0.8rem;
      color: var(--accent);
    }
    .body {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      padding: 0.6rem 0.8rem;
    }
  `,
})
export class PanelFrame {
  readonly title = input.required<string>();
  readonly stale = input(false);
  readonly pinned = input(false);
  readonly headerClick = output<void>();
}
