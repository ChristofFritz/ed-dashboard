import { Injectable, signal } from '@angular/core';

export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel: string;
  danger: boolean;
}

/**
 * App-level confirm dialog. Any component calls `ask()` and awaits the boolean;
 * the modal itself is rendered once at the app root (outside gridstack, so it
 * isn't clipped by a panel's transformed/overflow-hidden cell).
 */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  readonly request = signal<ConfirmRequest | null>(null);
  private resolver: ((v: boolean) => void) | null = null;

  ask(opts: { title?: string; message: string; confirmLabel?: string; danger?: boolean }): Promise<boolean> {
    this.request.set({
      title: opts.title ?? 'Confirm',
      message: opts.message,
      confirmLabel: opts.confirmLabel ?? 'Confirm',
      danger: opts.danger ?? false,
    });
    return new Promise<boolean>((resolve) => (this.resolver = resolve));
  }

  respond(ok: boolean): void {
    this.request.set(null);
    const r = this.resolver;
    this.resolver = null;
    r?.(ok);
  }
}
