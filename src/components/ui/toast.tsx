'use client';

import { useSyncExternalStore } from 'react';
import { toast, Toaster as Sonner } from 'sonner';

/**
 * docs/03_UI_Spec.md §7.12 and docs/02_AppFlow.md §7.4: bottom-centre above sticky bars on mobile,
 * top-right on desktop; success 3 s, error 6 s; max 3 visible; status-coloured left bar.
 */
const DESKTOP = '(min-width: 1024px)';
function subscribeDesktop(onChange: () => void) {
  const query = window.matchMedia(DESKTOP);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

export function Toaster() {
  const desktop = useSyncExternalStore(subscribeDesktop, () => window.matchMedia(DESKTOP).matches, () => false);

  return (
    <Sonner
      position={desktop ? 'top-right' : 'bottom-center'}
      visibleToasts={3}
      offset={desktop ? 24 : { bottom: 96 }}
      mobileOffset={{ bottom: 96, left: 16, right: 16 }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            'flex w-full items-start gap-3 rounded-md border-l-4 bg-surface p-4 text-sm text-fg shadow-lg sm:w-96 dark:border dark:border-l-4 dark:border-border',
          title: 'font-semibold',
          description: 'text-fg-muted',
          success: 'border-l-success',
          error: 'border-l-danger',
          warning: 'border-l-warning',
          info: 'border-l-info',
          icon: 'mt-0.5',
        },
      }}
    />
  );
}

export const notify = {
  success: (message: string) => toast.success(message, { duration: 3000 }),
  error: (message: string) => toast.error(message, { duration: 6000 }),
  info: (message: string) => toast.info(message, { duration: 4000 }),
  warning: (message: string) => toast.warning(message, { duration: 6000 }),
  /** Stays until dismissed: for outcomes that need follow-up (e.g. "approved, but the email failed"). */
  persistent: (message: string) => toast.warning(message, { duration: Number.POSITIVE_INFINITY, closeButton: true }),
};
