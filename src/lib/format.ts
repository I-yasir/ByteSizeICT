/**
 * Display formatting (docs/03_UI_Spec.md §8): Latin digits in both locales, times in Asia/Dhaka.
 * Use these instead of next-intl's formatter, whose `bn` defaults use Bengali digits. Isomorphic.
 */
type Locale = 'bn' | 'en';
const TZ = 'Asia/Dhaka';
const tag = (locale: Locale) => (locale === 'bn' ? 'bn-BD-u-nu-latn' : 'en-GB-u-nu-latn');

const PRESETS = {
  /** 7 Nov, 8:00 PM */
  dateTime: { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true },
  /** 7 Nov 2026, 8:00 PM */
  dateTimeYear: { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true },
  /** 7 Nov 2026 */
  date: { day: 'numeric', month: 'short', year: 'numeric' },
  /** Saturday, 7 November */
  dayHeading: { weekday: 'long', day: 'numeric', month: 'long' },
  /** 8:00 PM */
  time: { hour: 'numeric', minute: '2-digit', hour12: true },
} as const satisfies Record<string, Intl.DateTimeFormatOptions>;
export type DatePreset = keyof typeof PRESETS;

export function formatDate(value: Date | string, locale: Locale, preset: DatePreset = 'dateTime'): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat(tag(locale), { ...PRESETS[preset], timeZone: TZ }).format(date);
}

/** `YYYY-MM-DD` keys (from getRoutine) → "Saturday, 7 November". Noon avoids any day shift. */
export function formatDayKey(key: string, locale: Locale): string {
  return formatDate(new Date(`${key}T12:00:00+06:00`), locale, 'dayHeading');
}

export function formatNumber(value: number, locale: Locale, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat(tag(locale), { maximumFractionDigits }).format(value);
}

/** ৳1,500 */
export function formatTaka(value: number, locale: Locale): string {
  return `৳${formatNumber(value, locale, 0)}`;
}

/** Splits a duration into countdown units (docs/03_UI_Spec.md §7.20). */
export function splitDuration(ms: number): { days: number; hours: number; minutes: number; seconds: number } {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(total / 86_400),
    hours: Math.floor((total % 86_400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

/** Countdown segments with leading zero units dropped: [ [value, unit], … ] ending at seconds. */
export function countdownSegments(ms: number): [string, 'd' | 'h' | 'm' | 's'][] {
  const { days, hours, minutes, seconds } = splitDuration(ms);
  const pad = (n: number) => n.toString().padStart(2, '0');
  const all: [string, 'd' | 'h' | 'm' | 's'][] = [
    [String(days), 'd'],
    [pad(hours), 'h'],
    [pad(minutes), 'm'],
    [pad(seconds), 's'],
  ];
  const first = days > 0 ? 0 : hours > 0 ? 1 : 2; // always show at least MM:SS
  return all.slice(first);
}

/** ISO → `YYYY-MM-DDTHH:mm` in Asia/Dhaka for `<input type="datetime-local">` (admins always enter Dhaka time). */
export function toDhakaInput(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(Date.parse(iso) + 6 * 3600_000).toISOString().slice(0, 16);
}

/** `YYYY-MM-DDTHH:mm` (Dhaka) → ISO with offset, or null when empty. */
export function fromDhakaInput(value: string | null | undefined): string | null {
  if (!value) return null;
  return new Date(`${value}:00+06:00`).toISOString();
}
