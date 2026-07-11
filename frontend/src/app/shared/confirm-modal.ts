import { ChangeDetectionStrategy, Component, HostListener, inject } from '@angular/core';
import { ConfirmService } from '../core/confirm.service';

@Component({
  selector: 'ed-confirm-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (svc.request(); as r) {
      <div class="backdrop" (click)="svc.respond(false)">
        <div class="modal" (click)="$event.stopPropagation()" role="dialog" aria-modal="true">
          <h3>{{ r.title }}</h3>
          <p>{{ r.message }}</p>
          <div class="actions">
            <button class="cancel" (click)="svc.respond(false)">Cancel</button>
            <button class="confirm" [class.danger]="r.danger" (click)="svc.respond(true)">
              {{ r.confirmLabel }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: `
    .backdrop {
      position: fixed;
      inset: 0;
      z-index: 1000;
      background: rgba(0, 0, 0, 0.55);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .modal {
      background: var(--panel);
      border: 1px solid var(--panel-border);
      max-width: 24rem;
      padding: 1rem 1.2rem;
      box-shadow: 0 8px 30px rgba(0, 0, 0, 0.5);
    }
    h3 {
      margin: 0 0 0.5rem;
      font-size: 0.85rem;
      color: var(--accent);
    }
    p {
      margin: 0 0 1rem;
      color: var(--text);
      font-size: 0.85rem;
      line-height: 1.4;
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.5rem;
    }
    button {
      background: none;
      border: 1px solid var(--panel-border);
      color: var(--text-dim);
      font-family: var(--font);
      font-size: 0.75rem;
      padding: 0.3rem 0.8rem;
      cursor: pointer;
    }
    button:hover {
      color: var(--accent);
      border-color: var(--accent-dim);
    }
    .confirm {
      color: var(--accent);
      border-color: var(--accent-dim);
    }
    .confirm.danger {
      color: var(--danger);
      border-color: var(--danger);
    }
    .confirm.danger:hover {
      background: color-mix(in srgb, var(--danger) 15%, transparent);
    }
  `,
})
export class ConfirmModal {
  protected readonly svc = inject(ConfirmService);

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.svc.request()) this.svc.respond(false);
  }
}
