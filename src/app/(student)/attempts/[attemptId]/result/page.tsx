import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { Celebration } from '@/components/review/celebration';
import { AnalysisCards, MarksRing, SummaryCard } from '@/components/review/result-summary';
import { ReviewList } from '@/components/review/review-list';
import { Banner } from '@/components/ui/misc';
import { getAttemptResult } from '@/features/results/queries';
import { requireStudent } from '@/lib/auth/guards';
import { formatDate, formatNumber } from '@/lib/format';

/** /attempts/[attemptId]/result (PRD S-10/S-11, docs/02_AppFlow.md §5.5). */
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('result'))('title') };
}

export default async function ResultPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  const { student, accessState } = await requireStudent({ currentPath: `/attempts/${attemptId}/result` });
  if (!/^[0-9a-f-]{36}$/i.test(attemptId)) notFound();
  const outcome = await getAttemptResult(attemptId, { id: student.id, accessState });
  if (outcome.kind === 'not_found') notFound();
  if (outcome.kind === 'in_progress') redirect(`/attempts/${attemptId}`);
  if (outcome.kind === 'hidden') redirect('/renew');

  const { result } = outcome;
  const [t, locale] = await Promise.all([getTranslations('result'), getLocale() as Promise<'bn' | 'en'>]);
  const n = (v: number, digits = 2) => formatNumber(v, locale, digits);
  const percent = result.exam.totalMarks > 0 ? (result.attempt.score / result.exam.totalMarks) * 100 : 0;
  const publishText = (iso: string | null) => (iso ? formatDate(iso, locale, 'dateTimeYear') : '');

  return (
    <div className="mx-auto flex max-w-exam flex-col gap-5">
      {percent >= 80 ? <Celebration storageKey={`bsi:celebrated:${attemptId}`} /> : null}
      <SummaryCard
        title={result.exam.title}
        subtitle={result.exam.chapterLabel}
        lateBadge={result.attempt.isLate && result.rank.visible && result.rank.unrankedLate ? t('lateUnranked') : null}
        ring={<MarksRing score={result.attempt.score} total={result.exam.totalMarks} scoreText={n(result.attempt.score)} totalText={n(result.exam.totalMarks)} label={t('marks')} />}
      >
        {result.rank.visible ? (
          <>
            <p>
              {t('position')}:{' '}
              <strong className="font-num">
                {result.rank.position === null ? '—' : `${n(result.rank.position)}/${n(result.rank.participants)}`}
              </strong>
            </p>
            <p>
              {t('highest')}: <strong className="font-num">{result.rank.highest === null ? '—' : n(result.rank.highest)}</strong>
            </p>
          </>
        ) : (
          <p className="text-fg-muted">{t('rankLater', { time: publishText(result.rank.publishAt) })}</p>
        )}
        <p className="text-sm text-fg-muted">{t('submittedAt', { time: formatDate(result.attempt.submittedAt, locale, 'dateTime') })}{result.attempt.status === 'auto_submitted' ? ` · ${t('autoSubmitted')}` : ''}</p>
      </SummaryCard>

      <AnalysisCards
        labels={{ marks: t('marks'), correct: t('correct'), incorrect: t('incorrect'), skipped: t('skipped'), accuracy: t('accuracy'), analysis: t('analysis') }}
        values={{
          correct: n(result.attempt.correct, 0),
          incorrect: n(result.attempt.incorrect, 0),
          skipped: n(result.attempt.skipped, 0),
          accuracy: result.attempt.accuracy === null ? '—' : `${n(result.attempt.accuracy, 1)}%`,
        }}
      />

      {!result.answersVisible ? <Banner variant="info">{t('answersLater', { time: publishText(result.answersPublishAt) })}</Banner> : null}
      <ReviewList questions={result.questions} answersVisible={result.answersVisible} />
    </div>
  );
}
