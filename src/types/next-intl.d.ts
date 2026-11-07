import type { Locale } from '@/lib/i18n/config';
import type messages from '../../messages/bn.json';

// Type-safe message keys; `pnpm check:i18n` keeps en.json in sync with bn.json.
declare module 'next-intl' {
  interface AppConfig {
    Locale: Locale;
    Messages: typeof messages;
  }
}
