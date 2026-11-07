import { CalendarClock, Flame, Medal, Sigma, Target } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { ExamCard } from '@/components/student/exam-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/misc';
import { getStudentDashboard } from '@/features/dashboard/queries';
import { requireStudent } from '@/lib/auth/guards';
import { formatDate, formatNumber } from '@/lib/format';
import { maskMobile } from '@/lib/mobile';

/** /dashboard (PRD S-04, docs/02_AppFlow.md §5.2). */
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('dashboard'))('title') };
}

export default async function DashboardPage() {
  const { student, accessState } = await requireStudent({ currentPath: '/dashboard' });
  const [t, locale, data] = await Promise.all([getTranslations('dashboard'), getLocale() as Promise<'bn' | 'en'>, getStudentDashboard(student)]);
  const serverNow = new Date().toISOString();
  const daysLeft = Math.max(0, Math.ceil((Date.parse(student.access_expires_at) - Date.parse(serverNow)) / 86_400_000));
  const pct = (value: number | null) => (value === null ? '—' : `${formatNumber(value, locale, 1)}%`);

  const stats = [
    { label: t('stats.taken'), value: formatNumber(data.stats.examsTaken, locale), Icon: Sigma },
    { label: t('stats.average'), value: pct(data.stats.averagePercent), Icon: Target },
    { label: t('stats.best'), value: pct(data.stats.bestPercent), Icon: Medal },
    { label: t('stats.streak'), value: formatNumber(data.stats.streak, locale), Icon: Flame },
  ];

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-fg">{t('welcome')}</h1>
          <p className="font-num text-sm text-fg-muted">{maskMobile(student.mobile)}</p>
        </div>
        {accessState === 'active' ? (
          <Badge variant={daysLeft <= 7 ? 'warning' : 'success'} className="h-8 px-3 text-sm">
            {t('active', { days: formatNumber(daysLeft, locale) })}
          </Badge>
        ) : (
          <div className="flex items-center gap-2">
            <Badge variant="danger" className="h-8 px-3 text-sm">{t(`state.${accessState}`)}</Badge>
            <Button asChild size="sm">
              <Link href="/renew">{t('renew')}</Link>
            </Button>
          </div>
        )}
      </section>

      <section aria-labelledby="primary-exam">
        <h2 id="primary-exam" className="sr-only">{t('primary')}</h2>
        {data.primary ? (
          <ExamCard card={data.primary} serverNow={serverNow} prominent />
        ) : (
          <Card>
            <EmptyState icon={<CalendarClock />} title={data.upcoming[0] ? t('noneNow') : t('noneUpcoming')} />
          </Card>
        )}
      </section>

      <section aria-labelledby="stats" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <h2 id="stats" className="sr-only">{t('statsTitle')}</h2>
        {stats.map(({ label, value, Icon }) => (
          <Card key={label} className="flex flex-col gap-1">
            <Icon aria-hidden className="size-5 text-primary" />
            <span className="font-num text-2xl font-bold text-fg">{value}</span>
            <span className="text-sm text-fg-muted">{label}</span>
          </Card>
        ))}
        {data.stats.examsTaken === 0 ? <p className="col-span-full text-sm text-fg-muted">{t('statsHint')}</p> : null}
      </section>

      <section aria-labelledby="upcoming">
        <h2 id="upcoming" className="mb-3 text-lg font-semibold text-fg">{t('upcoming')}</h2>
        {data.upcoming.length ? (
          <ul className="flex flex-col gap-2">
            {data.upcoming.map((card) => (
              <li key={card.examId} className="flex items-center justify-between gap-3 rounded-lg bg-surface p-4 shadow-sm">
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-fg">{card.title}</span>
                  <span className="text-sm text-fg-muted">{formatDate(card.startsAt, locale, 'dateTime')}</span>
                </span>
                <span className="shrink-0 font-num text-sm text-fg-muted">{t('minutes', { n: formatNumber(card.durationMinutes, locale) })}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-fg-muted">{t('upcomingEmpty')}</p>
        )}
      </section>

      {data.missed.length ? (
        <section aria-labelledby="missed">
          <h2 id="missed" className="mb-3 text-lg font-semibold text-fg">{t('missed')}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {data.missed.map((card) => (
              <ExamCard key={card.examId} card={card} serverNow={serverNow} />
            ))}
          </div>
        </section>
      ) : null}

      <section aria-labelledby="recent">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="recent" className="text-lg font-semibold text-fg">{t('recent')}</h2>
          {data.recentResults.length ? (
            <Button asChild variant="ghost" size="sm">
              <Link href="/results">{t('allResults')}</Link>
            </Button>
          ) : null}
        </div>
        {data.recentResults.length ? (
          <ul className="flex flex-col gap-2">
            {data.recentResults.map((r) => (
              <li key={r.attemptId}>
                <Link href={`/attempts/${r.attemptId}/result`} className="flex items-center justify-between gap-3 rounded-lg bg-surface p-4 shadow-sm hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-focus-ring">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-fg">{r.examTitle}</span>
                    <span className="text-sm text-fg-muted">{formatDate(r.submittedAt, locale, 'date')}</span>
                  </span>
                  <span className="shrink-0 font-num font-bold text-fg">
                    {formatNumber(r.score, locale)}/{formatNumber(r.total, locale)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-fg-muted">{t('recentEmpty')}</p>
        )}
      </section>
    </div>
  );
}
