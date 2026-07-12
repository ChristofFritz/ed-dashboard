import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Dashboard } from './dashboard/dashboard';
import { AuthRedirect } from './core/auth-redirect';
import { Login } from './auth/login';
import { AuthService } from './core/auth.service';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Dashboard, AuthRedirect, Login],
  template: `
    @if (isAuthRedirect) {
      <ed-auth-redirect />
    } @else {
      @switch (auth.user()) {
        @case (undefined) {
          <!-- checking session -->
        }
        @case (null) {
          <ed-login />
        }
        @default {
          <ed-dashboard />
        }
      }
    }
  `,
})
export class App {
  protected readonly auth = inject(AuthService);
  // No router in this app; branch on the OAuth redirect path directly.
  protected readonly isAuthRedirect = location.pathname.startsWith('/edauthredirect');

  constructor() {
    if (!this.isAuthRedirect) void this.auth.check();
  }
}
