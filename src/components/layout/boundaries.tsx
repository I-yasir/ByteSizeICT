'use client';

import { CircleAlert } from 'lucide-react';
import { useTranslations } from '@/lib/i18n/client';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { EmptyState, Skeleton } from '@/components/ui/misc';

/**
 * docs/02_AppFlow.md §7.2 — friendly message, Retry, Go home; never a stack trace. Plain <a> links:
 * a full reload is the right recovery after an error, and next/link stays off the exam route (P4.20).
 */
export function ErrorView({ error, reset, homeHref = '/' }: { error: Error & { digest?: string }; reset: () => void; homeHref?: string }) {
  const t = useTranslations('errorPage');
  useEffect(() => {
    console.error(JSON.stringify({ level: 'error', event: 'ui.error_boundary', digest: error.digest, message: error.message }));
  }, [error]);
  return (
    <EmptyState
      icon={<CircleAlert />}
      title={t('title')}
      description={
        <>
          {t('body')}
          {error.digest ? <span className="mt-2 block font-num text-xs text-fg-subtle">ID: {error.digest}</span> : null}
        </>
      }
      action={
        <div className="flex flex-wrap justify-center gap-3">
          <Button onClick={reset}>{t('retry')}</Button>
          <Button asChild variant="secondary">
            <a href={homeHref}>{t('home')}</a>
          </Button>
        </div>
      }
      className="py-20"
    />
  );
}

/** Route-level skeletons matching typical page layouts (§7.1: never a full-page spinner). */
export function PageSkeleton({ variant = 'list' }: { variant?: 'list' | 'form' | 'marketing' }) {
  if (variant === 'form') {
    return (
      <div className="mx-auto flex max-w-form flex-col gap-4 px-4 py-10">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
      </div>
    );
  }
  if (variant === 'marketing') {
    return (
      <div className="mx-auto flex max-w-marketing flex-col gap-6 px-4 py-12 sm:px-6">
        <Skeleton className="h-12 w-3/4" />
        <Skeleton className="h-6 w-1/2" />
        <div className="flex gap-3">
          <Skeleton className="h-12 w-36" />
          <Skeleton className="h-12 w-44" />
        </div>
        <Skeleton className="mt-6 h-20" />
        <Skeleton className="h-40" />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3 py-4">
      <Skeleton className="h-8 w-1/2" />
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-24" />
      ))}
    </div>
  );
}
