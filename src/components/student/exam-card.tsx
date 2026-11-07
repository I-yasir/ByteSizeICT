import { Clock, FileQuestion } from 'lucide-react';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { StatusTag, type StatusKind } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { ExamCard as ExamCardData } from '@/features/exams/student-queries';
import { formatDate, formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { InlineCountdown } from './inline-countdown';

/** Exam card status → tag + primary action (docs/02_AppFlow.md §3.5). */
const TAG: Record<ExamCardData['status'], StatusKind> = {
  completed: 'completed',
  in_progress: 'live',
  locked: 'locked',
  upcoming: 'upcoming',
  live: 'live',
  missed_available: 'missed',
  missed: 'missed',
};

export async function ExamCard({ card, serverNow, prominent = false }: { card: ExamCardData; serverNow: string; prominent?: boolean }) {
  const t = await getTranslations('studentExams');
  const te = await getTranslations('exam');
  const locale = (await getLocale()) as 'bn' | 'en';

  const action = (() => {
    switch (card.status) {
      case 'completed':
        return card.attemptId ? { href: `/attempts/${card.attemptId}/result`, label: t('viewResult'), variant: 'secondary' as const } : null;
      case 'in_progress':
        return card.attemptId ? { href: `/attempts/${card.attemptId}`, label: t('resume'), variant: 'primary' as const } : null;
      case 'locked':
        return { href: '/renew', label: t('renew'), variant: 'secondary' as const };
      case 'live':
        return { href: `/exams/${card.examId}`, label: t('start'), variant: 'primary' as const };
      case 'missed_available':
        return { href: `/exams/${card.examId}`, label: t('takeNow'), variant: 'primary' as const };
      default:
        return null;
    }
  })();
  const soon = card.status === 'upcoming' && Date.parse(card.startsAt) - Date.parse(serverNow) < 86_400_000;

  return (
    <Card className={cn('flex flex-col gap-3', prominent && 'ring-2 ring-primary')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {card.chapterLabel ? <p className="text-sm text-fg-muted">{card.chapterLabel}</p> : null}
          <h3 className={cn('font-semibold text-fg', prominent ? 'text-xl' : 'text-lg')}>{card.title}</h3>
        </div>
        <StatusTag status={TAG[card.status]}>{t(`status.${card.status}`)}</StatusTag>
      </div>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-fg-muted">
        <span>{formatDate(card.startsAt, locale, 'dateTime')}</span>
        <span className="inline-flex items-center gap-1">
          <Clock aria-hidden className="size-4" />
          {te('minutes', { n: formatNumber(card.durationMinutes, locale) })}
        </span>
        <span className="inline-flex items-center gap-1">
          <FileQuestion aria-hidden className="size-4" />
          {te('questions', { n: formatNumber(card.questionCount, locale) })}
        </span>
      </p>
      {card.status === 'completed' && card.score !== null ? (
        <p className="font-num text-lg font-bold text-fg">
          {formatNumber(card.score, locale)}/{formatNumber(card.totalMarks, locale)}
          {card.isLate ? <span className="ml-2 align-middle text-xs font-semibold text-warning">{t('late')}</span> : null}
        </p>
      ) : null}
      {soon ? (
        <p className="text-sm text-fg-muted">
          {t('startsIn')} <InlineCountdown target={card.startsAt} serverNow={serverNow} />
        </p>
      ) : null}
      {action ? (
        <Button asChild variant={action.variant} size={prominent ? 'lg' : 'md'} fullWidth={prominent} className={prominent ? '' : 'self-start'}>
          <Link href={action.href}>{action.label}</Link>
        </Button>
      ) : null}
    </Card>
  );
}
