import { FileText, Plus, Star } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { FilterChips, PageHeader } from '@/components/admin/ui';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/misc';
import { listExamsAdmin } from '@/features/exams/queries';
import type { ExamPhase } from '@/features/exams/status';
import { formatDate, formatNumber } from '@/lib/format';

/** /admin/exams (docs/02_AppFlow.md §6.8). */
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('admin.exams'))('title') };
}

const PHASES = ['all', 'draft', 'scheduled', 'live', 'late_window', 'closed', 'archived'] as const;
const PHASE_BADGE = { draft: 'neutral', scheduled: 'warning', live: 'danger', late_window: 'teal', closed: 'success', archived: 'neutral' } as const;

export default async function ExamsAdminPage({ searchParams }: { searchParams: Promise<{ phase?: string }> }) {
  const { phase: raw } = await searchParams;
  const phase = (PHASES as readonly string[]).includes(raw ?? '') ? (raw as ExamPhase | 'all') : 'all';
  const [t, tb, locale, exams] = await Promise.all([getTranslations('admin.exams'), getTranslations('admin.builder'), getLocale() as Promise<'bn' | 'en'>, listExamsAdmin({ phase })]);
  return (
    <>
      <PageHeader title={t('title')} actions={<Button asChild leadingIcon={<Plus aria-hidden className="size-4" />}><Link href="/admin/exams/new">{t('new')}</Link></Button>} />
      <FilterChips items={PHASES.map((p) => ({ href: p === 'all' ? '/admin/exams' : `/admin/exams?phase=${p}`, label: p === 'all' ? t('all') : tb(`phase.${p}`), active: p === phase }))} />
      {exams.length === 0 ? (
        <EmptyState icon={<FileText />} title={t('empty')} />
      ) : (
        <ul className="flex flex-col gap-2">
          {exams.map((exam) => (
            <li key={exam.id}>
              <Link href={`/admin/exams/${exam.id}`} className="flex flex-wrap items-center gap-3 rounded-lg bg-surface p-4 shadow-sm hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-focus-ring">
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 font-semibold text-fg">
                    {exam.is_featured ? <Star aria-label={t('featured')} className="size-4 fill-warning text-warning" /> : null}
                    {exam.title}
                    {exam.is_sample ? <Badge variant="primary">{t('sample')}</Badge> : null}
                  </span>
                  <span className="text-sm text-fg-muted">{exam.starts_at ? formatDate(exam.starts_at, locale, 'dateTime') : '—'}</span>
                </span>
                <Badge variant={PHASE_BADGE[exam.phase]}>{tb(`phase.${exam.phase}`)}</Badge>
                <span className="font-num text-sm text-fg-muted">{t('counts', { q: formatNumber(exam.question_count, locale), a: formatNumber(exam.attempts, locale) })}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
