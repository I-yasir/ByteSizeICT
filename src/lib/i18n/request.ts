import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { APP_TIME_ZONE, defaultLocale, isLocale, LOCALE_COOKIE } from './config';

/**
 * next-intl request config without i18n routing: the locale comes from the NEXT_LOCALE cookie
 * (default `bn`). Registered via createNextIntlPlugin in next.config.ts.
 */
export default getRequestConfig(async () => {
  const cookieLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(cookieLocale) ? cookieLocale : defaultLocale;

  return {
    locale,
    messages: (await import(`../../../messages/${locale}.json`)).default,
    timeZone: APP_TIME_ZONE,
  };
});
