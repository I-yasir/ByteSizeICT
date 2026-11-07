'use server';

import { cookies } from 'next/headers';
import { isLocale, LOCALE_COOKIE } from '@/lib/i18n/config';

/** Language toggle (PRD S-14): persists the locale cookie for one year. */
export async function setLocale(locale: string): Promise<void> {
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: '/',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
    secure: process.env.NODE_ENV === 'production',
  });
}
