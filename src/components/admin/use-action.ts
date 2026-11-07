'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { notify } from '@/components/ui/toast';
import { useErrorMessage } from '@/components/ui/use-error-message';
import type { ActionResult } from '@/lib/errors';

/**
 * Runs a Server Action with pending state, error toast and optional refresh. Returns the result so
 * callers can map field errors themselves.
 */
export function useAction() {
  const router = useRouter();
  const errorText = useErrorMessage();
  const [pending, setPending] = useState(false);
  const run = useCallback(
    async <T>(action: () => Promise<ActionResult<T>>, options: { success?: string; refresh?: boolean; silentError?: boolean } = {}) => {
      setPending(true);
      try {
        const result = await action();
        if (result.ok) {
          if (options.success) notify.success(options.success);
          if (options.refresh !== false) router.refresh();
        } else if (!options.silentError) {
          notify.error(errorText(result.error));
        }
        return result;
      } catch {
        notify.error(errorText({ message: 'errors.internal' }));
        return { ok: false, error: { code: 'INTERNAL', message: 'errors.internal' } } as ActionResult<T>;
      } finally {
        setPending(false);
      }
    },
    [errorText, router],
  );
  return { run, pending };
}
