'use client';

import { LayoutGrid, Star } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Dialog, DialogTrigger, SheetContent } from '@/components/ui/dialog';
import { useIsDesktop } from '@/components/ui/hooks';
import { cn } from '@/lib/utils';

export type NavItemState = 'unanswered' | 'answered' | 'correct' | 'incorrect' | 'skipped';
export type NavItem = { n: number; state: NavItemState; marked?: boolean };

const CELL: Record<NavItemState, string> = {
  unanswered: 'border border-border-strong text-fg',
  answered: 'bg-primary text-on-primary',
  correct: 'bg-success text-fg-inverse',
  incorrect: 'bg-danger text-fg-inverse',
  skipped: 'bg-info-soft text-info',
};

/** docs/03_UI_Spec.md §7.9 — FAB → bottom sheet (mobile) / right drawer (desktop). */
export function QuestionNavigator({
  items,
  current,
  onJump,
  badge,
  className,
}: {
  items: NavItem[];
  current?: number;
  onJump: (n: number) => void;
  badge?: number;
  className?: string;
}) {
  const t = useTranslations('examPage');
  const desktop = useIsDesktop();
  const [open, setOpen] = useState(false);
  const review = items.some((i) => i.state === 'correct' || i.state === 'incorrect' || i.state === 'skipped');
  const counts = items.reduce<Record<string, number>>((acc, item) => {
    acc[item.state] = (acc[item.state] ?? 0) + 1;
    if (item.marked) acc.marked = (acc.marked ?? 0) + 1;
    return acc;
  }, {});
  const legend = review
    ? (['correct', 'incorrect', 'skipped'] as const)
    : (['answered', 'unanswered'] as const);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        aria-label={t('navigator')}
        className={cn(
          'fixed right-4 z-fab flex size-14 items-center justify-center rounded-full bg-primary text-on-primary shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring lg:right-6 lg:bottom-6',
          className,
        )}
      >
        <LayoutGrid aria-hidden className="size-6" />
        {badge ? (
          <span className="absolute -top-1 -right-1 min-w-6 rounded-full bg-danger px-1.5 font-num text-xs leading-6 font-semibold text-fg-inverse">{badge}</span>
        ) : null}
      </DialogTrigger>
      <SheetContent side={desktop ? 'right' : 'bottom'} title={t('navigator')}>
        <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-muted">
          {legend.map((state) => (
            <span key={state} className="inline-flex items-center gap-1.5">
              <span aria-hidden className={cn('size-3 rounded-sm', CELL[state])} />
              {t(`legend.${state}`)} · <span className="font-num">{counts[state] ?? 0}</span>
            </span>
          ))}
          {!review ? (
            <span className="inline-flex items-center gap-1.5">
              <Star aria-hidden className="size-3 fill-warning text-warning" />
              {t('legend.marked')} · <span className="font-num">{counts.marked ?? 0}</span>
            </span>
          ) : null}
        </div>
        <ol className="grid grid-cols-6 gap-2 xs:grid-cols-8 lg:grid-cols-5">
          {items.map((item) => (
            <li key={item.n}>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onJump(item.n);
                }}
                aria-label={`${t('question', { n: item.n })}: ${t(`legend.${item.state}`)}${item.marked ? `, ${t('legend.marked')}` : ''}`}
                aria-current={current === item.n ? 'true' : undefined}
                className={cn(
                  'relative flex size-11 items-center justify-center rounded-md font-num text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
                  CELL[item.state],
                  item.marked && 'ring-2 ring-warning',
                  current === item.n && 'outline-2 outline-fg',
                )}
              >
                {item.n}
                {item.marked ? <Star aria-hidden className="absolute -top-1 -right-1 size-3 fill-warning text-warning" /> : null}
              </button>
            </li>
          ))}
        </ol>
      </SheetContent>
    </Dialog>
  );
}
