import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../core/auth.service';
import { ApiError } from '../core/api';

@Component({
  selector: 'ed-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <div class="wrap">
      <form class="card" (ngSubmit)="submit()">
        <h1>ED DASHBOARD</h1>
        <p class="sub">{{ mode() === 'login' ? 'Sign in to your dashboard' : 'Create an account' }}</p>

        <label>EMAIL<input type="email" name="email" [(ngModel)]="email" autocomplete="email" required /></label>
        @if (mode() === 'register') {
          <label>NAME (optional)<input type="text" name="name" [(ngModel)]="displayName" autocomplete="nickname" /></label>
        }
        <label>
          PASSWORD
          <input
            type="password"
            name="password"
            [(ngModel)]="password"
            [attr.autocomplete]="mode() === 'login' ? 'current-password' : 'new-password'"
            required
          />
        </label>

        @if (error()) {
          <p class="err">{{ error() }}</p>
        }

        <button type="submit" [disabled]="busy()">
          {{ busy() ? '…' : mode() === 'login' ? 'SIGN IN' : 'REGISTER' }}
        </button>

        <button type="button" class="link" (click)="toggle()">
          {{ mode() === 'login' ? 'Need an account? Register' : 'Have an account? Sign in' }}
        </button>
      </form>
    </div>
  `,
  styles: `
    .wrap {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      font-family: var(--font, monospace);
    }
    .card {
      display: flex;
      flex-direction: column;
      gap: 0.8rem;
      width: min(22rem, 90vw);
      padding: 1.5rem;
      border: 1px solid var(--panel-border, #333);
      background: var(--panel, #111);
    }
    h1 {
      margin: 0;
      font-size: 1.1rem;
      color: var(--accent, #ff7100);
      letter-spacing: 0.12em;
    }
    .sub {
      margin: 0 0 0.4rem;
      color: var(--text-dim, #999);
      font-size: 0.8rem;
    }
    label {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      font-size: 0.68rem;
      color: var(--text-dim, #999);
      letter-spacing: 0.08em;
    }
    input {
      background: var(--bg, #000);
      border: 1px solid var(--panel-border, #333);
      color: var(--text, #ddd);
      font-family: var(--font, monospace);
      padding: 0.4rem 0.5rem;
    }
    input:focus {
      outline: none;
      border-color: var(--accent, #ff7100);
    }
    button[type='submit'] {
      margin-top: 0.4rem;
      background: none;
      border: 1px solid var(--accent-dim, #a04800);
      color: var(--accent, #ff7100);
      font-family: var(--font, monospace);
      padding: 0.5rem;
      cursor: pointer;
      letter-spacing: 0.1em;
    }
    button[type='submit']:disabled {
      opacity: 0.5;
    }
    .link {
      background: none;
      border: none;
      color: var(--text-dim, #999);
      cursor: pointer;
      font-size: 0.72rem;
      text-decoration: underline;
    }
    .err {
      margin: 0;
      color: var(--danger, #ff4444);
      font-size: 0.75rem;
    }
  `,
})
export class Login {
  private readonly auth = inject(AuthService);
  protected readonly mode = signal<'login' | 'register'>('login');
  protected email = '';
  protected password = '';
  protected displayName = '';
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected toggle(): void {
    this.mode.set(this.mode() === 'login' ? 'register' : 'login');
    this.error.set('');
  }

  protected async submit(): Promise<void> {
    if (this.busy()) return;
    this.error.set('');
    this.busy.set(true);
    try {
      if (this.mode() === 'login') {
        await this.auth.login(this.email.trim(), this.password);
      } else {
        await this.auth.register(this.email.trim(), this.password, this.displayName.trim() || undefined);
      }
      // AuthService.user() now set — App swaps to the dashboard.
    } catch (err) {
      this.error.set(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      this.busy.set(false);
    }
  }
}
