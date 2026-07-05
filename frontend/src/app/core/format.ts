import { Pipe, PipeTransform } from '@angular/core';

/** 5665438219 → "5.67B", 731110 → "731.1K", 500 → "500" */
export function compactCredits(value: number | null | undefined): string {
  if (value == null) return '—';
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (abs >= 1e4) return `${(value / 1e3).toFixed(1)}K`;
  return `${value.toLocaleString('en-US')}`;
}

@Pipe({ name: 'credits' })
export class CreditsPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    return value == null ? '—' : `${compactCredits(value)} CR`;
  }
}

@Pipe({ name: 'num' })
export class NumPipe implements PipeTransform {
  transform(value: number | null | undefined, digits = 0): string {
    return value == null
      ? '—'
      : value.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });
  }
}
