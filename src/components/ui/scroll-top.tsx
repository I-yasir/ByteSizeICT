'use client';

import { ArrowUp } from 'lucide-react';
import { useTranslations } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';
import { scrollBehavior, useScrolledPast } from './hooks';

/** Scroll-to-top FAB, bottom-left, after 600 px (docs/02_AppFlow.md §5.4 item 7). */
export function ScrollTopButton({ className }: { className?: string }) {
  const t = useTranslations('common');
  const visible = useScrolledPast(600);
  if (!visible) return null;
  return (
    <button
      type="button"
      aria-label={t('scrollTop')}
      onClick={() => window.scrollTo({ top: 0, behavior: scrollBehavior() })}
      className={cn(
        'fixed left-4 z-fab flex size-12 items-center justify-center rounded-full border border-border bg-surface text-fg shadow-lg hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-focus-ring',
        className,
      )}
    >
      <ArrowUp aria-hidden className="size-5" />
    </button>
  );
}
