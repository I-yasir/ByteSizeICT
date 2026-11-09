import { ChevronRight, Clock, FileQuestion, Trophy } from 'lucide-react';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { StatusTag } from '@/components/ui/badge';
import type { ExamCard } from '@/features/exams/student-queries';
import { formatDate, formatDayKey, formatNumber } from '@/lib/format';
import { dhakaDateKey } from '@/lib/time';
import { CARD_TAG } from './exam-card';

/** "Your routine" on /routine (docs/02_AppFlow.md §4.2, D4): the student's exams grouped by Dhaka date. */
export async function RoutineDays({ cards }: { cards: ExamCard[] }) {
  const t = await getTranslations('exam');
  const ts = await getTranslations('studentExams');
  const locale = (await getLocale()) as 'bn' | 'en';
  const days = new Map<string, ExamCard[]>();
  for (const card of [...cards].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))) {
    const key = dhakaDateKey(new Date(card.startsAt));
    days.set(key, [...(days.get(key) ?? []), card]);
  }
  return (
    <div className="flex flex-col gap-6">
      {[...days.entries()].map(([date, exams]) => (
        <section key={date} aria-labelledby={`day-${date}`}>
          <h3 id={`day-${date}`} className="mb-2 text-sm font-semibold text-fg-muted">{formatDayKey(date, locale)}</h3>
          <ul className="flex flex-col gap-2">
            {exams.map((exam) => (
              <li key={exam.examId}>
                <Link
                  href={`/exams/${exam.examId}`}
                  className="flex gap-4 rounded-lg bg-surface p-4 shadow-sm hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-focus-ring"
                >
                  <span className="w-20 shrink-0 font-num text-sm font-semibold text-primary">{formatDate(exam.startsAt, locale, 'time')}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-fg">{exam.title}</span>
                      <StatusTag status={CARD_TAG[exam.status]}>{ts(`status.${exam.status}`)}</StatusTag>
                    </span>
                    {exam.chapterLabel ? <span className="block text-sm text-fg-muted">{exam.chapterLabel}</span> : null}
                    <span className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-fg-muted">
                      <span className="inline-flex items-center gap-1"><Clock aria-hidden className="size-4" />{t('minutes', { n: formatNumber(exam.durationMinutes, locale) })}</span>
                      <span className="inline-flex items-center gap-1"><FileQuestion aria-hidden className="size-4" />{t('questions', { n: formatNumber(exam.questionCount, locale) })}</span>
                      <span className="inline-flex items-center gap-1"><Trophy aria-hidden className="size-4" />{t('marks', { n: formatNumber(exam.totalMarks, locale) })}</span>
                    </span>
                    <span className="mt-1 block text-xs text-fg-subtle">
                      {exam.negativeMark > 0 ? t('negative', { mark: formatNumber(exam.negativeMark, locale) }) : t('noNegative')}
                    </span>
                  </span>
                  <ChevronRight aria-hidden className="size-5 shrink-0 self-center text-fg-subtle" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
