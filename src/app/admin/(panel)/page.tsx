import type { Metadata } from 'next';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { PageHeader, StatTile } from '@/components/admin/ui';
import { Card } from '@/components/ui/card';
import { getAdminOverview } from '@/features/dashboard/queries';
import { formatDate, formatNumber, formatTaka } from '@/lib/format';

/** /admin overview (PRD A-02, docs/02_AppFlow.md §6.2). */
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('admin.overview'))('title') };
}

export default async function AdminOverviewPage() {
  const [t, locale, data] = await Promise.all([getTranslations('admin.overview'), getLocale() as Promise<'bn' | 'en'>, getAdminOverview()]);
  const n = (v: number) => formatNumber(v, locale);
  return (
    <>
      <PageHeader title={t('title')} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label={t('total')} value={n(data.students.total)} href="/admin/students" />
        <StatTile label={t('active')} value={n(data.students.active)} href="/admin/students?state=active" />
        <StatTile label={t('expired')} value={n(data.students.expired)} href="/admin/students?state=expired" />
        <StatTile label={t('cancelled')} value={n(data.students.cancelled)} href="/admin/students?state=cancelled" />
        <StatTile label={t('pending')} value={n(data.pendingAdmissions)} href="/admin/admissions" highlight={data.pendingAdmissions > 0} />
        <StatTile label={t('revenue')} value={formatTaka(data.revenueThisMonth, locale)} />
        <StatTile label={t('examsThisWeek')} value={n(data.examsThisWeek)} href="/admin/exams" />
        <StatTile label={t('suspended')} value={n(data.students.suspended)} href="/admin/students?state=suspended" />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold text-fg">{t('upcoming')}</h2>
          {data.upcomingExams.length ? (
            <ul className="flex flex-col divide-y divide-border">
              {data.upcomingExams.map((exam) => (
                <li key={exam.id}>
                  <Link href={`/admin/exams/${exam.id}`} className="flex min-h-12 items-center justify-between gap-3 py-2 hover:text-primary">
                    <span className="truncate font-medium text-fg">{exam.title}</span>
                    <span className="shrink-0 font-num text-sm text-fg-muted">{exam.starts_at ? formatDate(exam.starts_at, locale, 'dateTime') : ''}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-fg-muted">{t('noUpcoming')}</p>
          )}
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold text-fg">{t('activity')}</h2>
          {data.recentActivity.length ? (
            <ul className="flex flex-col divide-y divide-border text-sm">
              {data.recentActivity.map((event) => (
                <li key={event.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="block font-mono text-xs text-fg">{event.action}</span>
                    <span className="text-xs text-fg-muted">{event.admin?.email ?? event.actor_type}</span>
                  </span>
                  <span className="shrink-0 font-num text-xs text-fg-subtle">{formatDate(event.created_at, locale, 'dateTime')}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-fg-muted">{t('noActivity')}</p>
          )}
          <Link href="/admin/audit" className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-primary">{t('allActivity')}</Link>
        </Card>
      </div>
    </>
  );
}
