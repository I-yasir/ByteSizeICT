'use client';

import { Check, Star } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type KeyboardEvent, memo } from 'react';
import { RichText } from '@/components/content/rich-text';
import { cn } from '@/lib/utils';
import type { OptionKey, PaperQuestion } from '@/types/domain';
import type { Entry } from './exam-store';

const LETTERS = ['A', 'B', 'C', 'D'] as const;

/** docs/03_UI_Spec.md §7.7–7.8. Display letters follow display order; values are canonical keys. */
export const QuestionCard = memo(function QuestionCard({
  question,
  entry,
  allowMark,
  disabled,
  highlightKey,
  onSelect,
  onToggleMark,
}: {
  question: PaperQuestion;
  entry: Entry | undefined;
  allowMark: boolean;
  disabled: boolean;
  /** Admin preview only: canonical key to highlight. */
  highlightKey?: OptionKey | undefined;
  onSelect: (questionId: string, key: OptionKey) => void;
  onToggleMark: (questionId: string) => void;
}) {
  const t = useTranslations('examPage');
  const selected = entry?.o ?? null;
  const marked = entry?.m ?? false;

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.target !== event.currentTarget || disabled) return;
    const key = event.key.toLowerCase();
    const index = ['1', '2', '3', '4'].indexOf(key) >= 0 ? Number(key) - 1 : ['a', 'b', 'c', 'd'].indexOf(key);
    const option = question.options[index];
    if (index >= 0 && option) {
      event.preventDefault();
      onSelect(question.id, option.key);
    } else if (key === 'm' && allowMark) {
      event.preventDefault();
      onToggleMark(question.id);
    } else if (key === 'j' || key === 'k') {
      event.preventDefault();
      const sibling = document.getElementById(`q-${question.n + (key === 'j' ? 1 : -1)}`);
      sibling?.focus();
    }
  }

  return (
    <article
      id={`q-${question.n}`}
      tabIndex={0}
      onKeyDown={onKeyDown}
      aria-labelledby={`q-${question.n}-label`}
      data-index={question.n - 1}
      className={cn(
        'cv-auto scroll-mt-28 rounded-lg border-l-3 bg-surface p-4 shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
        selected ? 'border-l-primary' : marked ? 'border-l-warning' : 'border-l-transparent',
      )}
    >
      <header className="mb-2 flex items-center justify-between gap-2">
        <h2 id={`q-${question.n}-label`} className="flex items-center gap-2 text-sm font-semibold text-fg-muted">
          {t('question', { n: question.n })}
          {selected ? (
            <span className="inline-flex items-center gap-0.5 text-xs text-primary">
              <Check aria-hidden className="size-3.5" /> {t('answered')}
            </span>
          ) : null}
        </h2>
        {allowMark ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onToggleMark(question.id)}
            aria-pressed={marked}
            aria-label={marked ? t('unmark') : t('mark')}
            className="-mr-2 flex size-11 items-center justify-center rounded-md text-fg-subtle hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-focus-ring"
          >
            <Star aria-hidden className={cn('size-5', marked && 'fill-warning text-warning')} />
          </button>
        ) : null}
      </header>
      <RichText html={question.stemHtml} className="text-question text-fg" />
      {question.stemImageUrl ? <QuestionImage src={question.stemImageUrl} /> : null}
      <div role="radiogroup" aria-labelledby={`q-${question.n}-label`} className="mt-3 flex flex-col gap-2">
        {question.options.map((option, index) => {
          const isSelected = selected === option.key;
          const isHighlighted = highlightKey === option.key;
          return (
            <button
              key={option.key}
              type="button"
              role="radio"
              aria-checked={isSelected}
              disabled={disabled}
              onClick={() => onSelect(question.id, option.key)}
              className={cn(
                'flex min-h-14 w-full items-center gap-3 rounded-md border px-4 py-3 text-left text-base text-fg transition-colors duration-120 active:scale-99',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-70',
                isSelected
                  ? 'border-primary-soft-border bg-primary-soft ring-2 ring-primary ring-inset'
                  : isHighlighted
                    ? 'border-success bg-correct-option-bg'
                    : 'border-border-strong bg-surface hover:bg-surface-2',
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-full border-2 font-num text-sm font-semibold transition-colors duration-180',
                  isSelected ? 'animate-check-in border-primary bg-primary text-on-primary' : 'border-border-strong text-fg-muted',
                )}
              >
                {LETTERS[index]}
              </span>
              <span className="min-w-0 flex-1">
                <RichText html={option.html} as="span" />
                {option.imageUrl ? <QuestionImage src={option.imageUrl} /> : null}
              </span>
            </button>
          );
        })}
      </div>
    </article>
  );
});

/** Lazy image with a white matte for transparent diagrams in dark mode (UI Spec §5 rule 4). */
export function QuestionImage({ src }: { src: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived storage URLs; next/image would proxy and cache them
    <img src={src} alt="" loading="lazy" decoding="async" className="mt-2 max-h-72 w-auto rounded-md bg-image-matte p-1" />
  );
}
