import { ArrowLeft, CircleCheck } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { StatusTag } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Banner } from '@/components/ui/misc';
import { getExamLobby } from '@/features/exams/student-queries';
import { requireActiveStudent } from '@/lib/auth/guards';
import { formatDate, formatNumber } from '@/lib/format';
import { StartExamButton } from './start-button';

/** /exams/[examId] lobby (docs/02_AppFlow.md §5.3). Inactive students are sent to /renew by the guard. */
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('lobby'))('title') };
}

export default async function LobbyPage({ params }: { params: Promise<{ examId: string }> }) {
  const { examId } = await params;
  const { student } = await requireActiveStudent({ currentPath: `/exams/${examId}` });
  if (!/^[0-9a-f-]{36}$/i.test(examId)) notFound();
  const lobby = await getExamLobby(examId, student.id);
  if (!lobby) notFound();
  const [t, te, locale] = await Promise.all([getTranslations('lobby'), getTranslations('exam'), getLocale() as Promise<'bn' | 'en'>]);
  const n = (v: number) => formatNumber(v, locale);

  const facts = [
    [t('when'), formatDate(lobby.startsAt, locale, 'dateTimeYear')],
    [t('duration'), te('minutes', { n: n(lobby.durationMinutes) })],
    [t('questions'), n(lobby.questionCount)],
    [t('totalMarks'), n(lobby.totalMarks)],
    [t('perQuestion'), n(lobby.marksPerQuestion)],
  ] as const;
  const rules = [t('rules.autosave'), t('rules.autosubmit'), t('rules.single'), t('rules.device')];
  const serverNow = new Date().toISOString();

  const action =
    lobby.status === 'completed' && lobby.attemptId ? (
      <Button asChild size="lg" fullWidth variant="secondary"><Link href={`/attempts/${lobby.attemptId}/result`}>{t('viewResult')}</Link></Button>
    ) : lobby.status === 'in_progress' && lobby.attemptId ? (
      <Button asChild size="lg" fullWidth><Link href={`/attempts/${lobby.attemptId}`}>{t('resume')}</Link></Button>
    ) : lobby.status === 'live' || lobby.status === 'missed_available' || lobby.status === 'upcoming' ? (
      <StartExamButton examId={examId} startsAt={lobby.startsAt} serverNow={serverNow} upcoming={lobby.status === 'upcoming'} label={lobby.status === 'missed_available' ? t('takeNow') : t('start')} />
    ) : (
      <p className="text-base font-semibold text-danger">{t('closed')}</p>
    );

  return (
    <div className="mx-auto flex max-w-exam flex-col gap-5">
      <Link href="/exams" className="inline-flex min-h-11 items-center gap-1 self-start text-sm font-semibold text-primary"><ArrowLeft aria-hidden className="size-4" /> {t('back')}</Link>
      <div>
        {lobby.chapterLabel ? <p className="text-sm text-fg-muted">{lobby.chapterLabel}</p> : null}
        <h1 className="text-2xl font-bold text-fg">{lobby.title}</h1>
        {lobby.status === 'missed_available' ? <StatusTag status="missed" className="mt-2">{t('lateWindow')}</StatusTag> : null}
      </div>
      {lobby.description ? <p className="text-base whitespace-pre-line text-fg-muted">{lobby.description}</p> : null}
      <Card>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          {facts.map(([label, value]) => (
            <div key={label}>
              <dt className="text-sm text-fg-muted">{label}</dt>
              <dd className="font-num font-semibold text-fg">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 rounded-md bg-surface-2 px-3 py-2 text-sm text-fg">
          {lobby.negativeMark > 0 ? t('negative', { mark: n(lobby.negativeMark) }) : te('noNegative')}
        </p>
      </Card>
      {lobby.lateAttemptUnranked ? <Banner variant="info">{t('lateUnranked')}</Banner> : null}
      <Card>
        <h2 className="mb-2 font-semibold text-fg">{t('rulesTitle')}</h2>
        <ul className="flex flex-col gap-2">
          {rules.map((rule) => (
            <li key={rule} className="flex gap-2 text-sm text-fg-muted"><CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />{rule}</li>
          ))}
        </ul>
      </Card>
      <div className="sticky bottom-20 md:static">{action}</div>
    </div>
  );
}
