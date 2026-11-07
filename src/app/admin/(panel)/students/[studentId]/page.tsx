import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { STATE_BADGE } from '@/components/admin/badges';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/controls';
import { getStudentProfile } from '@/features/students/queries';
import { formatDate, formatNumber, formatTaka } from '@/lib/format';
import { StudentActions } from './student-actions';

/** /admin/students/[studentId] (docs/02_AppFlow.md §6.4). */
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('admin.students'))('profile') };
}

export default async function StudentProfilePage({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(studentId)) notFound();
  const [t, locale, data] = await Promise.all([getTranslations('admin.students'), getLocale() as Promise<'bn' | 'en'>, getStudentProfile(studentId)]);
  if (!data) notFound();
  const { student } = data;
  const n = (v: number) => formatNumber(v, locale);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/admin/students" className="text-sm font-semibold text-primary">← {t('title')}</Link>
          <h1 className="mt-1 font-num text-2xl font-bold text-fg">{student.mobile}</h1>
          <p className="text-sm break-all text-fg-muted">{student.email}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge variant={STATE_BADGE[student.accessState]}>{t(`states.${student.accessState}`)}</Badge>
            {student.admin_label ? <Badge variant="primary">{student.admin_label}</Badge> : null}
          </div>
        </div>
        <StudentActions student={{ id: student.id, mobile: student.mobile, email: student.email, status: student.status, adminLabel: student.admin_label, adminNote: student.admin_note, expiresAt: student.access_expires_at }} />
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">{t('tabs.overview')}</TabsTrigger>
          <TabsTrigger value="payments">{t('tabs.payments')}</TabsTrigger>
          <TabsTrigger value="exams">{t('tabs.exams')}</TabsTrigger>
          <TabsTrigger value="audit">{t('tabs.audit')}</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="pt-4">
          <Card>
            <dl className="grid gap-3 sm:grid-cols-2">
              {[
                [t('fields.plan'), student.plan?.name_en ?? '—'],
                [t('fields.starts'), formatDate(student.access_starts_at, locale, 'dateTimeYear')],
                [t('fields.expires'), formatDate(student.access_expires_at, locale, 'dateTimeYear')],
                [t('fields.credentials'), `${t(`credentials.${student.credentials_status}`)}${student.credentials_sent_at ? ` · ${formatDate(student.credentials_sent_at, locale, 'dateTime')}` : ''}`],
                [t('fields.mustChangePin'), student.must_change_pin ? t('yes') : t('no')],
                [t('fields.lastLogin'), student.last_login_at ? formatDate(student.last_login_at, locale, 'dateTime') : '—'],
                [t('fields.statusReason'), student.status_reason ?? '—'],
                [t('fields.note'), student.admin_note ?? '—'],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-sm text-fg-muted">{label}</dt>
                  <dd className="font-num text-fg whitespace-pre-line">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </TabsContent>
        <TabsContent value="payments" className="pt-4">
          <ul className="flex flex-col gap-2">
            {data.payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface p-4 shadow-sm text-sm">
                <span className="font-num font-semibold">{p.trx_id}</span>
                <span>{p.payment_method} · {p.amount_bdt !== null ? formatTaka(p.amount_bdt, locale) : '—'} · {p.plan?.name_en ?? '—'}</span>
                <Badge variant={p.status === 'approved' ? 'success' : p.status === 'pending' ? 'warning' : 'danger'}>{p.status}</Badge>
                <span className="font-num text-fg-muted">{formatDate(p.created_at, locale, 'date')}</span>
              </li>
            ))}
            {data.payments.length === 0 ? <p className="text-sm text-fg-muted">{t('noPayments')}</p> : null}
          </ul>
        </TabsContent>
        <TabsContent value="exams" className="pt-4">
          <ul className="flex flex-col gap-2">
            {data.attempts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface p-4 shadow-sm text-sm">
                <Link href={`/admin/exams/${a.exam?.id}/results`} className="font-semibold text-primary">{a.exam?.title}</Link>
                <span className="font-num">{a.score === null ? t('inProgress') : `${n(Number(a.score))}/${n(a.totalMarks)} · ${n(a.correct_count ?? 0)}/${n(a.incorrect_count ?? 0)}/${n(a.skipped_count ?? 0)}`}</span>
                {a.is_late ? <Badge variant="warning">{t('late')}</Badge> : null}
                <span className="font-num text-fg-muted">{formatDate(a.started_at, locale, 'dateTime')}</span>
              </li>
            ))}
            {data.attempts.length === 0 ? <p className="text-sm text-fg-muted">{t('noExams')}</p> : null}
          </ul>
        </TabsContent>
        <TabsContent value="audit" className="pt-4">
          <ul className="flex flex-col gap-2">
            {data.audit.map((e) => (
              <li key={e.id} className="rounded-lg bg-surface p-3 text-sm shadow-sm">
                <div className="flex justify-between gap-2">
                  <span className="font-mono text-xs">{e.action}</span>
                  <span className="font-num text-xs text-fg-muted">{formatDate(e.created_at, locale, 'dateTime')}</span>
                </div>
                <p className="mt-1 text-xs break-all text-fg-muted">{e.admin?.email ?? e.actor_type} {e.after ? `→ ${JSON.stringify(e.after)}` : ''}</p>
              </li>
            ))}
            {data.audit.length === 0 ? <p className="text-sm text-fg-muted">{t('noAudit')}</p> : null}
          </ul>
        </TabsContent>
      </Tabs>
    </>
  );
}
