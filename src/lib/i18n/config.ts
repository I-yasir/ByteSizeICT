/** Locale configuration (TRD ADR-08): cookie-based, no URL prefix, Bangla default. */
export const locales = ['bn', 'en'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'bn';
export const LOCALE_COOKIE = 'NEXT_LOCALE';
export const APP_TIME_ZONE = 'Asia/Dhaka';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (locales as readonly string[]).includes(value);
}
