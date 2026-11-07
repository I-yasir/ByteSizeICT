'use client';

import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import type { ActionError } from '@/lib/errors';

/** Translates an action error (`message` is an i18n key such as `errors.trxDuplicate`). */
export function useErrorMessage() {
  const t = useTranslations();
  return useCallback(
    (error: Pick<ActionError, 'message' | 'meta'> | null | undefined, values: Record<string, string | number> = {}) => {
      if (!error) return '';
      const key = error.message as Parameters<typeof t>[0];
      return t.has(key) ? t(key, values as never) : t('errors.internal');
    },
    [t],
  );
}
