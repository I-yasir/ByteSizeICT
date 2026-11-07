import { Trophy } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/misc';
import { percentBand } from '@/components/review/result-summary';
import { listStudentResults } from '@/features/results/queries';
import { getSetting } from '@/features/settings/queries';
import { requireStudent } from '@/lib/auth/guards';
import { formatDate, formatNumber } from '@/lib/format';

/** /results (PRD S-12, docs/02_AppFlow.md §5.6): 20 per page with "Load more". */
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('results'))('title') };
}

const PILL = { success: 'success', primary: 'primary', warning: 'warning', danger: 'danger' } as const;

export default async function ResultsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { student, accessState } = await requireStudent({ currentPath: '/results' });
  if (accessState !== 'active' && !(await getSetting('results')).visibleWhenInactive) redirect('/renew');
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const [t, locale, data] = await Promise.all([getTranslations('results'), getLocale() as Promise<'bn' | 'en'>, listStudentResults(student.id, { page: 1, pageSize: page * 20 })]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold text-fg">{t('title')}</h1>
      {data.items.length === 0 ? (
        <EmptyState
          icon={<Trophy />}
          title={t('empty')}
          action={
            <Button asChild>
              <Link href="/exams">{t('goExams')}</Link>
            </Button>
          }
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {data.items.map((r) => (
            <li key={r.attemptId}>
              <Link href={`/attempts/${r.attemptId}/result`} className="flex items-center justify-between gap-3 rounded-lg bg-surface p-4 shadow-sm hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-focus-ring">
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-fg">{r.examTitle}</span>
                  <span className="text-sm text-fg-muted">
                    {formatDate(r.submittedAt, locale, 'date')}
                    {r.isLate ? <Badge variant="warning" className="ml-2">{t('late')}</Badge> : null}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className="font-num font-bold text-fg">{formatNumber(r.score, locale)}/{formatNumber(r.total, locale)}</span>
                  <Badge variant={PILL[percentBand(r.percent)]}>{formatNumber(r.percent, locale, 1)}%</Badge>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {data.total > data.items.length ? (
        <Button asChild variant="secondary" className="self-center">
          <Link href={`/results?page=${page + 1}`} scroll={false}>{t('loadMore')}</Link>
        </Button>
      ) : null}
    </div>
  );
}
