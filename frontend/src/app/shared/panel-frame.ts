import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'ed-panel-frame',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="panel" [class.stale]="stale()">
      <header>
        <h2>{{ title() }}</h2>
        <span class="tools">
          <span class="grip" title="Drag to move">⠿</span>
          <button
            class="hide"
            title="Hide panel"
            (mousedown)="$event.stopPropagation()"
            (click)="close.emit()"
          >
            ✕
          </button>
        </span>
      </header>
      <div class="body">
        <ng-content />
      </div>
    </section>
  `,
  styles: `
    :host {
      display: flex;
      flex: 1;
      min-height: 0;
    }
    .panel {
      display: flex;
      flex: 1;
      flex-direction: column;
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
      cursor: move;
      user-select: none;
    }
    h2 {
      margin: 0;
      font-size: 0.8rem;
      color: var(--accent);
    }
    .tools {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .grip {
      color: var(--text-dim);
      font-size: 0.9rem;
      letter-spacing: -0.15em;
    }
    .hide {
      background: none;
      border: none;
      color: var(--text-dim);
      font-family: var(--font);
      font-size: 0.75rem;
      cursor: pointer;
      padding: 0 0.1rem;
      line-height: 1;
    }
    .hide:hover {
      color: var(--danger);
    }
    .body {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      padding: 0.6rem 0.8rem;
      /* content is not a drag handle — let the user select/copy text */
      user-select: text;
    }
  `,
})
export class PanelFrame {
  readonly title = input.required<string>();
  readonly stale = input(false);
  readonly close = output<void>();
}
