import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Dialog action row (docs/03_UI_Spec.md §7.11): right-aligned on ≥ 640 px; on phones stacked
 * full-width (primary last) and sticky at the bottom of the sheet so the primary action stays reachable.
 */
export function DialogActions({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'sticky bottom-0 -mx-6 mt-6 flex flex-col-reverse gap-3 border-t border-border bg-surface px-6 py-4',
        'sm:static sm:mx-0 sm:flex-row sm:justify-end sm:border-0 sm:bg-transparent sm:p-0',
        className,
      )}
    >
      {children}
    </div>
  );
}
