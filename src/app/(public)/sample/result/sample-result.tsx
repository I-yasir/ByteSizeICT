'use client';

import { track } from '@vercel/analytics';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useSyncExternalStore } from 'react';
import { SAMPLE_RESULT_KEY } from '@/components/exam/use-exam-session';
import { AnalysisCards, MarksRing, SummaryCard } from '@/components/review/result-summary';
import { ReviewList } from '@/components/review/review-list';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/misc';
import type { SampleResult } from '@/features/sample/service';
import { formatNumber } from '@/lib/format';

/** /sample/result — client-held result from POST /api/sample/score (docs/02_AppFlow.md §4.5). */
const noop = () => () => {};
function readResult(): string | null {
  try {
    return sessionStorage.getItem(SAMPLE_RESULT_KEY);
  } catch {
    return null;
  }
}

export function SampleResultView() {
  const t = useTranslations('result');
  const ts = useTranslations('sample');
  const locale = useLocale() as 'bn' | 'en';
  const router = useRouter();
  // undefined = not read yet (server render), null = nothing stored, string = stored result
  const raw = useSyncExternalStore<string | null | undefined>(noop, readResult, () => undefined);
  const result = raw ? (JSON.parse(raw) as SampleResult) : null;

  useEffect(() => {
    if (raw === null) router.replace('/sample');
  }, [raw, router]);

  if (!result) return <Skeleton className="h-96" />;
  const n = (v: number, d = 2) => formatNumber(v, locale, d);

  return (
    <div className="flex flex-col gap-5 pb-24">
      <SummaryCard
        title={ts('resultTitle')}
        ring={<MarksRing score={result.score} total={result.total} scoreText={n(result.score)} totalText={n(result.total)} label={t('marks')} />}
      >
        <p className="text-fg-muted">{ts('resultBody')}</p>
      </SummaryCard>
      <AnalysisCards
        labels={{ marks: t('marks'), correct: t('correct'), incorrect: t('incorrect'), skipped: t('skipped'), accuracy: t('accuracy'), analysis: t('analysis') }}
        values={{
          correct: n(result.correct, 0),
          incorrect: n(result.incorrect, 0),
          skipped: n(result.skipped, 0),
          accuracy: result.accuracy === null ? '—' : `${n(result.accuracy, 1)}%`,
        }}
      />
      <ReviewList questions={result.questions} answersVisible fabClassName="bottom-24" />
      <div className="fixed inset-x-0 bottom-0 z-sticky border-t border-border bg-surface px-4 pt-2 pb-safe shadow-md">
        <div className="mx-auto max-w-exam pb-2">
          <Button asChild size="lg" fullWidth>
            <Link href="/enroll" onClick={() => track('sample_enroll_click')}>{ts('enroll')}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
