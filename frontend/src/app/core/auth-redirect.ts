import { ChangeDetectionStrategy, Component, OnInit, signal } from '@angular/core';

/**
 * Landing page for the Frontier OAuth redirect
 * (https://localhost:4200/edauthredirect?code=…&state=…). Hands the code to the
 * backend to exchange for tokens, then bounces back to the dashboard.
 */
@Component({
  selector: 'ed-auth-redirect',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wrap">
      <h1>FRONTIER LINK</h1>
      <p [class.err]="failed()">{{ message() }}</p>
      @if (failed()) {
        <a class="btn" href="/">BACK TO DASHBOARD</a>
      }
    </div>
  `,
  styles: `
    .wrap {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      align-items: center;
      justify-content: center;
      height: 100vh;
      font-family: var(--font, monospace);
    }
    h1 {
      color: var(--accent, #ff7100);
      font-size: 1rem;
      letter-spacing: 0.1em;
    }
    .err {
      color: var(--danger, #ff4444);
    }
    .btn {
      border: 1px solid var(--accent-dim, #a04800);
      color: var(--accent, #ff7100);
      padding: 0.4rem 0.8rem;
      text-decoration: none;
      font-size: 0.8rem;
    }
  `,
})
export class AuthRedirect implements OnInit {
  protected readonly message = signal('Linking your Frontier account…');
  protected readonly failed = signal(false);

  async ngOnInit(): Promise<void> {
    const params = new URLSearchParams(location.search);
    const code = params.get('code');
    const state = params.get('state');
    const err = params.get('error');
    if (err || !code || !state) {
      this.fail(err ? `Frontier returned: ${err}` : 'Missing authorization code.');
      return;
    }
    try {
      const res = await fetch('/api/capi/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, state }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `exchange failed (${res.status})`);
      }
      this.message.set('Linked. Returning to dashboard…');
      setTimeout(() => (location.href = '/'), 1200);
    } catch (e) {
      this.fail(e instanceof Error ? e.message : 'Link failed.');
    }
  }

  private fail(msg: string): void {
    this.failed.set(true);
    this.message.set(msg);
  }
}
