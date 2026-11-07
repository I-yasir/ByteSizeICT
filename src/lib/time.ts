/** Asia/Dhaka helpers (UTC+6, no DST — docs/01_PRD.md §7). Isomorphic. */
export const DHAKA_TZ = 'Asia/Dhaka';
const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** `YYYY-MM-DD` of the instant in Dhaka. */
export function dhakaDateKey(date: Date = new Date()): string {
  return new Date(date.getTime() + DHAKA_OFFSET_MS).toISOString().slice(0, 10);
}

/** UTC instant of 00:00 Dhaka on the day containing `date`. */
export function startOfDhakaDay(date: Date = new Date()): Date {
  const shifted = date.getTime() + DHAKA_OFFSET_MS;
  return new Date(shifted - (shifted % DAY_MS) - DHAKA_OFFSET_MS);
}

/** UTC instant of 00:00 Dhaka on the 1st of the month containing `date`. */
export function startOfDhakaMonth(date: Date = new Date()): Date {
  const key = dhakaDateKey(date);
  return new Date(`${key.slice(0, 7)}-01T00:00:00+06:00`);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** "7 Nov 2026, 8:00 PM" style, Latin digits, in Dhaka (docs/03_UI_Spec.md §8). */
export function formatDhaka(date: Date | string, locale: 'bn' | 'en' = 'en'): string {
  return new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-GB', {
    timeZone: DHAKA_TZ,
    numberingSystem: 'latn',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(typeof date === 'string' ? new Date(date) : date);
}
