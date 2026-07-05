import { effect, Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'ed-font-scale';
const MIN = 0.8;
const MAX = 1.8;
const STEP = 0.1;
const DEFAULT = 1.15;
const BASE_PX = 16;

/** Global UI scale. Everything is sized in rem, so scaling the root font-size scales the whole dashboard. */
@Injectable({ providedIn: 'root' })
export class FontScaleService {
  readonly scale = signal(this.load());

  constructor() {
    effect(() => {
      const scale = this.scale();
      document.documentElement.style.fontSize = `${BASE_PX * scale}px`;
      localStorage.setItem(STORAGE_KEY, String(scale));
    });
  }

  increase(): void {
    this.scale.update((s) => Math.min(MAX, Math.round((s + STEP) * 10) / 10));
  }

  decrease(): void {
    this.scale.update((s) => Math.max(MIN, Math.round((s - STEP) * 10) / 10));
  }

  reset(): void {
    this.scale.set(DEFAULT);
  }

  private load(): number {
    const stored = Number(localStorage.getItem(STORAGE_KEY));
    return stored >= MIN && stored <= MAX ? stored : DEFAULT;
  }
}
