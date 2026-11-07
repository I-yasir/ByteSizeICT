import { ClipboardList } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ExamCard } from '@/components/student/exam-card';
import { EmptyState } from '@/components/ui/misc';
import { type CardStatus, getStudentExamCards } from '@/features/exams/student-queries';
import { requireStudent } from '@/lib/auth/guards';
import { cn } from '@/lib/utils';

/** /exams (PRD S-05, docs/02_AppFlow.md §5.3). Filters are links so they work without JS. */
const FILTERS = {
  all: null,
  live: ['live', 'in_progress', 'missed_available'],
  upcoming: ['upcoming'],
  completed: ['completed'],
  missed: ['missed', 'missed_available'],
} as const satisfies Record<string, readonly CardStatus[] | null>;
type Filter = keyof typeof FILTERS;

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('studentExams'))('title') };
}

export default async function ExamsPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const { student } = await requireStudent({ currentPath: '/exams' });
  const [{ filter: raw }, t, cards] = await Promise.all([searchParams, getTranslations('studentExams'), getStudentExamCards(student.id)]);
  const filter: Filter = raw && raw in FILTERS ? (raw as Filter) : 'all';
  const allowed = FILTERS[filter];
  const shown = allowed ? cards.filter((c) => (allowed as readonly CardStatus[]).includes(c.status)) : cards;
  const serverNow = new Date().toISOString();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold text-fg">{t('title')}</h1>
      <nav aria-label={t('filterLabel')} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {(Object.keys(FILTERS) as Filter[]).map((key) => (
          <Link
            key={key}
            href={key === 'all' ? '/exams' : `/exams?filter=${key}`}
            aria-current={key === filter ? 'page' : undefined}
            className={cn(
              'inline-flex h-10 shrink-0 items-center rounded-full border px-4 text-sm font-semibold transition-colors duration-120',
              key === filter ? 'border-primary bg-primary-soft text-primary' : 'border-border-strong bg-surface text-fg-muted hover:bg-surface-2',
            )}
          >
            {t(`filters.${key}`)}
          </Link>
        ))}
      </nav>
      {shown.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {shown.map((card) => (
            <ExamCard key={card.examId} card={card} serverNow={serverNow} />
          ))}
        </div>
      ) : (
        <EmptyState icon={<ClipboardList />} title={t('empty', { filter: t(`filters.${filter}`) })} />
      )}
    </div>
  );
}
