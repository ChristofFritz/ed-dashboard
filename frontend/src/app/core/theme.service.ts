import { effect, Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'ed-theme';
export type Theme = 'dark' | 'light';

/** Light/dark theme, applied via `data-theme` on the document root. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<Theme>(this.load());

  constructor() {
    effect(() => {
      const theme = this.theme();
      document.documentElement.dataset['theme'] = theme;
      localStorage.setItem(STORAGE_KEY, theme);
    });
  }

  toggle(): void {
    this.theme.update((t) => (t === 'dark' ? 'light' : 'dark'));
  }

  private load(): Theme {
    // ?theme=light|dark pins the theme (handy for a wall-mounted tablet).
    const param = new URLSearchParams(location.search).get('theme');
    if (param === 'light' || param === 'dark') return param;
    return localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark';
  }
}
