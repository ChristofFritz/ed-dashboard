import { ChangeDetectionStrategy, Component, inject, OnInit, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { IngestTokenCreated, IngestTokenInfo } from '@ed/shared';
import { api } from '../core/api';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'ed-account',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <div class="backdrop" (click)="close.emit()"></div>
    <div class="modal">
      <header>
        <h2>ACCOUNT</h2>
        <button class="x" (click)="close.emit()">✕</button>
      </header>

      <p class="who">{{ auth.user()?.email }}</p>

      <section>
        <h3>CLIENT TOKENS</h3>
        <p class="hint">
          Run the ED Dashboard client on the PC where Elite Dangerous is installed. It reads your
          journal files and streams them here. Create a token and give it to the client via
          <code>ED_INGEST_TOKEN</code>.
        </p>

        <div class="new">
          <input placeholder="token label (e.g. gaming-pc)" [(ngModel)]="label" name="label" />
          <button (click)="createToken()" [disabled]="busy()">+ NEW TOKEN</button>
        </div>

        @if (created(); as c) {
          <div class="secret">
            <p>Copy this now — it won't be shown again:</p>
            <code>{{ c.token }}</code>
          </div>
        }

        @if (tokens().length === 0) {
          <p class="empty">No tokens yet.</p>
        } @else {
          <ul>
            @for (t of tokens(); track t.id) {
              <li>
                <span class="lbl">{{ t.label }}</span>
                <span class="suffix">…{{ t.suffix }}</span>
                <span class="used">{{ t.lastUsedAt ? 'used ' + t.lastUsedAt.slice(0, 10) : 'never used' }}</span>
                <button class="rm" (click)="revoke(t.id)">REVOKE</button>
              </li>
            }
          </ul>
        }
      </section>

      <section>
        <h3>RUN THE CLIENT</h3>
        <pre>
ED_SERVER_URL={{ origin }} \
ED_INGEST_TOKEN=&lt;your token&gt; \
npm run start -w client</pre
        >
      </section>

      <footer>
        <button class="logout" (click)="auth.logout()">SIGN OUT</button>
      </footer>
    </div>
  `,
  styles: `
    .backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.6);
      z-index: 40;
    }
    .modal {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 41;
      width: min(38rem, 92vw);
      max-height: 88vh;
      overflow-y: auto;
      background: var(--panel, #111);
      border: 1px solid var(--panel-border, #333);
      padding: 1rem 1.25rem;
      font-family: var(--font, monospace);
      color: var(--text, #ddd);
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    h2 {
      margin: 0;
      font-size: 1rem;
      color: var(--accent, #ff7100);
      letter-spacing: 0.1em;
    }
    h3 {
      font-size: 0.75rem;
      color: var(--accent, #ff7100);
      letter-spacing: 0.08em;
      margin: 1.2rem 0 0.4rem;
    }
    .who {
      color: var(--text-dim, #999);
      font-size: 0.8rem;
      margin: 0.2rem 0 0;
    }
    .hint {
      font-size: 0.72rem;
      color: var(--text-dim, #999);
      line-height: 1.5;
    }
    .new {
      display: flex;
      gap: 0.5rem;
    }
    input {
      flex: 1;
      background: var(--bg, #000);
      border: 1px solid var(--panel-border, #333);
      color: var(--text, #ddd);
      font-family: var(--font, monospace);
      padding: 0.35rem 0.5rem;
    }
    button {
      background: none;
      border: 1px solid var(--panel-border, #333);
      color: var(--text-dim, #999);
      font-family: var(--font, monospace);
      font-size: 0.7rem;
      padding: 0.3rem 0.55rem;
      cursor: pointer;
    }
    button:hover {
      color: var(--accent, #ff7100);
      border-color: var(--accent-dim, #a04800);
    }
    .x {
      border: none;
      font-size: 0.9rem;
    }
    .secret {
      border: 1px solid var(--accent-dim, #a04800);
      padding: 0.5rem 0.6rem;
      margin: 0.6rem 0;
      font-size: 0.72rem;
    }
    .secret code,
    pre {
      display: block;
      word-break: break-all;
      white-space: pre-wrap;
      color: var(--accent, #ff7100);
      background: var(--bg, #000);
      padding: 0.4rem 0.5rem;
      margin-top: 0.3rem;
      font-size: 0.72rem;
    }
    ul {
      list-style: none;
      padding: 0;
      margin: 0.5rem 0 0;
    }
    li {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      padding: 0.35rem 0;
      border-bottom: 1px solid var(--panel-border, #333);
      font-size: 0.75rem;
    }
    .lbl {
      color: var(--text, #ddd);
    }
    .suffix,
    .used {
      color: var(--text-dim, #999);
      font-size: 0.68rem;
    }
    .used {
      margin-left: auto;
    }
    .empty {
      color: var(--text-dim, #999);
      font-size: 0.75rem;
    }
    footer {
      margin-top: 1.2rem;
      display: flex;
      justify-content: flex-end;
    }
    .logout {
      border-color: var(--danger, #ff4444);
      color: var(--danger, #ff4444);
    }
  `,
})
export class Account implements OnInit {
  readonly close = output<void>();
  protected readonly auth = inject(AuthService);
  protected readonly tokens = signal<IngestTokenInfo[]>([]);
  protected readonly created = signal<IngestTokenCreated | null>(null);
  protected readonly busy = signal(false);
  protected label = '';
  protected readonly origin = location.origin;

  async ngOnInit(): Promise<void> {
    await this.refresh();
  }

  private async refresh(): Promise<void> {
    const { tokens } = await api.get<{ tokens: IngestTokenInfo[] }>('/api/tokens');
    this.tokens.set(tokens);
  }

  protected async createToken(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      const { token } = await api.post<{ token: IngestTokenCreated }>('/api/tokens', {
        label: this.label.trim() || 'client',
      });
      this.created.set(token);
      this.label = '';
      await this.refresh();
    } finally {
      this.busy.set(false);
    }
  }

  protected async revoke(id: number): Promise<void> {
    await api.del(`/api/tokens/${id}`);
    if (this.created()?.id === id) this.created.set(null);
    await this.refresh();
  }
}
