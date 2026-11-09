import { Download, FileText } from 'lucide-react';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { PublicPlan } from '@/features/public/queries';
import { formatDate, formatNumber, formatTaka } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * Plan card (docs/03_UI_Spec.md §7.23): homepage pricing and /routine. Every "Choose this plan" is
 * `primary` (CR7, the documented exception to one primary per region); "View routine" sits above it.
 */
export async function PlanCard({ plan, routineFallback = false }: { plan: PublicPlan; routineFallback?: boolean }) {
  const t = await getTranslations('home.pricing');
  const locale = (await getLocale()) as 'bn' | 'en';
  const name = locale === 'bn' ? plan.nameBn : plan.nameEn;
  return (
    <Card className={cn('flex h-full flex-col gap-3', plan.isHighlighted && 'ring-2 ring-primary')}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-fg">{name}</h3>
        {plan.isHighlighted ? <Badge variant="primary">{t('popular')}</Badge> : null}
      </div>
      <p className="font-num text-4xl font-bold text-fg">{formatTaka(plan.priceBdt, locale)}</p>
      <p className="text-sm text-fg-muted">
        {plan.durationDays
          ? t('days', { days: formatNumber(plan.durationDays, locale) })
          : plan.fixedExpiresAt
            ? t('until', { date: formatDate(plan.fixedExpiresAt, locale, 'date') })
            : null}
      </p>
      {plan.features.length > 0 ? (
        <ul className="flex flex-col gap-1.5 text-sm text-fg">
          {plan.features.map((feature, i) => (
            <li key={i} className="flex gap-2">
              <span aria-hidden className="text-success">✓</span>
              {feature[locale]}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-auto flex flex-col gap-2 pt-2">
        {plan.routine ? (
          <div className="flex flex-col gap-1">
            <Button asChild variant="secondary" fullWidth leadingIcon={<FileText aria-hidden className="size-4" />}>
              <a href={plan.routine.view} target="_blank" rel="noopener noreferrer" data-testid="view-routine">
                {t('viewRoutine')}
                <span className="sr-only"> — {name}</span>
              </a>
            </Button>
            <a
              href={plan.routine.download}
              className="inline-flex min-h-11 items-center justify-center gap-1.5 text-sm font-semibold text-primary hover:underline"
              data-testid="download-routine"
            >
              <Download aria-hidden className="size-4" />
              {t('downloadRoutine')}
              <span className="sr-only"> — {name}</span>
            </a>
          </div>
        ) : routineFallback ? (
          <p className="flex min-h-11 items-center justify-center rounded-md bg-surface-2 text-sm text-fg-muted">{t('routineSoon')}</p>
        ) : null}
        <Button asChild fullWidth>
          <Link href={`/enroll?plan=${encodeURIComponent(plan.code)}`}>
            {t('choose')}
            <span className="sr-only"> — {name}</span>
          </Link>
        </Button>
      </div>
    </Card>
  );
}
