'use client';

import { SearchX } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/misc';
import { useTranslations } from '@/lib/i18n/client';

/** docs/02_AppFlow.md §7.3 — 404 with links to Home / Dashboard (separate from boundaries.tsx to keep next/link off the exam route). */
export function NotFoundView() {
  const t = useTranslations('notFound');
  return (
    <EmptyState
      icon={<SearchX />}
      title={t('title')}
      description={t('body')}
      action={
        <div className="flex flex-wrap justify-center gap-3">
          <Button asChild>
            <Link href="/">{t('home')}</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/dashboard">{t('dashboard')}</Link>
          </Button>
        </div>
      }
      className="py-20"
    />
  );
}
