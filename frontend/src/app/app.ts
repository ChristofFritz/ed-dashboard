import { Component } from '@angular/core';
import { Dashboard } from './dashboard/dashboard';
import { AuthRedirect } from './core/auth-redirect';

@Component({
  selector: 'app-root',
  imports: [Dashboard, AuthRedirect],
  template: `
    @if (isAuthRedirect) {
      <ed-auth-redirect />
    } @else {
      <ed-dashboard />
    }
  `,
})
export class App {
  // No router in this app; branch on the OAuth redirect path directly.
  protected readonly isAuthRedirect = location.pathname.startsWith('/edauthredirect');
}
