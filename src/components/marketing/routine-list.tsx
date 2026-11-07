import { Clock, FileQuestion, Trophy } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import type { RoutineDay } from '@/features/public/queries';
import { formatDate, formatDayKey, formatNumber } from '@/lib/format';

/** Date-grouped exam list shared by the homepage and /routine (PRD V-03). */
export async function RoutineList({ days }: { days: RoutineDay[] }) {
  const t = await getTranslations('exam');
  const locale = (await getLocale()) as 'bn' | 'en';
  return (
    <div className="flex flex-col gap-6">
      {days.map((day) => (
        <section key={day.date} aria-labelledby={`day-${day.date}`}>
          <h3 id={`day-${day.date}`} className="mb-2 text-sm font-semibold text-fg-muted">
            {formatDayKey(day.date, locale)}
          </h3>
          <ul className="flex flex-col gap-2">
            {day.exams.map((exam) => (
              <li key={exam.id} className="flex gap-4 rounded-lg bg-surface p-4 shadow-sm">
                <span className="w-20 shrink-0 font-num text-sm font-semibold text-primary">{formatDate(exam.startsAt, locale, 'time')}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-fg">{exam.title}</p>
                  {exam.chapterLabel ? <p className="text-sm text-fg-muted">{exam.chapterLabel}</p> : null}
                  <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-fg-muted">
                    <span className="inline-flex items-center gap-1">
                      <Clock aria-hidden className="size-4" />
                      {t('minutes', { n: formatNumber(exam.durationMinutes, locale) })}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <FileQuestion aria-hidden className="size-4" />
                      {t('questions', { n: formatNumber(exam.questionCount, locale) })}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Trophy aria-hidden className="size-4" />
                      {t('marks', { n: formatNumber(exam.totalMarks, locale) })}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-fg-subtle">
                    {exam.negativeMark > 0 ? t('negative', { mark: formatNumber(exam.negativeMark, locale) }) : t('noNegative')}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
