'use client';

import { Check, Lightbulb, X } from 'lucide-react';
import { useTranslations } from '@/lib/i18n/client';
import { useMemo, useState } from 'react';
import { RichText } from '@/components/content/rich-text';
import { QuestionImage } from '@/components/exam/question-card';
import { type NavItem, QuestionNavigator } from '@/components/exam/question-navigator';
import { StatusTag } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/controls';
import { scrollBehavior } from '@/components/ui/hooks';
import { EmptyState } from '@/components/ui/misc';
import { ScrollTopButton } from '@/components/ui/scroll-top';
import { cn } from '@/lib/utils';
import type { OptionKey, QuestionStatus, ReviewQuestion } from '@/types/domain';

const LETTERS = ['A', 'B', 'C', 'D'] as const;

/** Question-by-question review with filters (docs/02_AppFlow.md §5.5, UI Spec §7.8, §7.15–7.16). */
export function ReviewList({ questions, answersVisible, fabClassName }: { questions: ReviewQuestion[]; answersVisible: boolean; fabClassName?: string }) {
  const t = useTranslations('review');
  const [filters, setFilters] = useState<Record<QuestionStatus, boolean>>({ correct: true, incorrect: true, skipped: true });
  const shown = useMemo(
    () => (answersVisible ? questions.filter((q) => q.status && filters[q.status]) : questions),
    [answersVisible, filters, questions],
  );
  const navItems: NavItem[] = questions.map((q) => ({
    n: q.n,
    state: q.status ?? (q.selected ? 'answered' : 'unanswered'),
  }));

  function jump(n: number) {
    const q = questions.find((item) => item.n === n);
    if (q?.status && !filters[q.status]) setFilters((f) => ({ ...f, [q.status as QuestionStatus]: true }));
    requestAnimationFrame(() => document.getElementById(`r-${n}`)?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' }));
  }

  return (
    <section aria-labelledby="review-title" className="flex flex-col gap-3">
      <h2 id="review-title" className="text-lg font-semibold text-fg">{t('title')}</h2>
      {answersVisible ? (
        <div className="flex flex-wrap items-center gap-x-4 rounded-lg bg-surface px-4 py-1 shadow-sm">
          {(['correct', 'incorrect', 'skipped'] as const).map((key) => (
            <Checkbox
              key={key}
              label={t(`filters.${key}`)}
              checked={filters[key]}
              onCheckedChange={(value) => setFilters((f) => ({ ...f, [key]: value === true }))}
            />
          ))}
          <span className="ml-auto font-num text-sm text-fg-muted">{t('showing', { n: shown.length, total: questions.length })}</span>
        </div>
      ) : null}

      {shown.length === 0 ? (
        <EmptyState icon={<Check />} title={t('selectFilter')} />
      ) : (
        shown.map((q) => <ReviewCard key={q.id} question={q} answersVisible={answersVisible} />)
      )}

      <QuestionNavigator items={navItems} onJump={jump} className={fabClassName ?? 'bottom-24 md:bottom-6'} />
      <ScrollTopButton className={fabClassName ?? 'bottom-24 md:bottom-6'} />
    </section>
  );
}

function ReviewCard({ question, answersVisible }: { question: ReviewQuestion; answersVisible: boolean }) {
  const t = useTranslations('review');
  return (
    <article id={`r-${question.n}`} className="cv-auto scroll-mt-20 rounded-lg bg-surface p-4 shadow-sm">
      <header className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-fg-muted">{t('question', { n: question.n })}</h3>
        {question.status ? <StatusTag status={question.status}>{t(`filters.${question.status}`)}</StatusTag> : null}
      </header>
      <RichText html={question.stemHtml} className="text-question text-fg" />
      {question.stemImageUrl ? <QuestionImage src={question.stemImageUrl} /> : null}

      <ul className="mt-3 flex flex-col gap-2">
        {question.options.map((option, index) => {
          const isCorrect = answersVisible && question.correctOption === option.key;
          const isWrongPick = answersVisible && question.selected === option.key && !isCorrect;
          const isNeutralPick = !answersVisible && question.selected === option.key;
          return (
            <li
              key={option.key}
              className={cn(
                'flex min-h-14 items-center gap-3 rounded-md border px-4 py-3 text-base text-fg',
                isCorrect && 'border-success bg-correct-option-bg',
                isWrongPick && 'border-danger bg-wrong-option-bg',
                isNeutralPick && 'border-primary-soft-border bg-primary-soft ring-2 ring-primary ring-inset',
                !isCorrect && !isWrongPick && !isNeutralPick && 'border-border-strong',
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-full border-2 font-num text-sm font-semibold',
                  isCorrect ? 'border-success bg-success text-fg-inverse' : isWrongPick ? 'border-danger bg-danger text-fg-inverse' : isNeutralPick ? 'border-primary bg-primary text-on-primary' : 'border-border-strong text-fg-muted',
                )}
              >
                {isCorrect ? <Check className="size-4" /> : isWrongPick ? <X className="size-4" /> : LETTERS[index]}
              </span>
              <span className="min-w-0 flex-1">
                <RichText html={option.html} as="span" />
                {option.imageUrl ? <QuestionImage src={option.imageUrl} /> : null}
              </span>
              <span className="sr-only">
                {isCorrect ? t('srCorrect') : ''} {question.selected === option.key ? t('srYourAnswer') : ''}
              </span>
            </li>
          );
        })}
      </ul>

      {question.stats ? <OptionStats stats={question.stats} order={question.options.map((o) => o.key)} correct={question.correctOption} selected={question.selected} /> : null}

      {answersVisible ? (
        <div className="mt-3 rounded-md border border-solution-border bg-solution-bg p-4">
          <p className="mb-1 flex items-center gap-1.5 text-sm font-bold text-success">
            <Lightbulb aria-hidden className="size-4" /> {t('solution')}
          </p>
          {question.explanationHtml ? <RichText html={question.explanationHtml} className="text-base text-fg" /> : <p className="text-base text-fg-muted">{t('noSolution')}</p>}
          {question.explanationImageUrl ? <QuestionImage src={question.explanationImageUrl} /> : null}
        </div>
      ) : null}
    </article>
  );
}

function OptionStats({
  stats,
  order,
  correct,
  selected,
}: {
  stats: NonNullable<ReviewQuestion['stats']>;
  order: OptionKey[];
  correct: OptionKey | null;
  selected: OptionKey | null;
}) {
  const t = useTranslations('review');
  const rows = [
    ...order.map((key, index) => ({ id: key, label: LETTERS[index] as string, pct: stats[key], kind: key === correct ? 'correct' : key === selected ? 'wrong' : 'other' })),
    { id: 'skipped', label: t('skippedShort'), pct: stats.skipped, kind: 'skipped' },
  ];
  return (
    <div className="mt-3 rounded-md bg-surface-2 p-3">
      <p className="mb-2 text-xs font-semibold text-fg-muted">{t('statsTitle')}</p>
      <ul className="flex flex-col gap-1.5">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center gap-2" aria-label={t('statsRow', { option: row.label, pct: row.pct })}>
            <span aria-hidden className="w-6 shrink-0 font-num text-xs font-semibold text-fg-muted">{row.label}</span>
            <span aria-hidden className="h-2 flex-1 overflow-hidden rounded-full bg-stat-bar-track">
              <span
                className={cn(
                  'block h-full rounded-full',
                  row.kind === 'correct' && 'bg-success',
                  row.kind === 'wrong' && 'bg-danger',
                  row.kind === 'other' && 'bg-fg-subtle/60',
                  row.kind === 'skipped' && 'bg-info',
                )}
                style={{ width: `${row.pct}%` }}
              />
            </span>
            <span aria-hidden className="w-12 shrink-0 text-right font-num text-xs text-fg-muted">{row.pct}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
