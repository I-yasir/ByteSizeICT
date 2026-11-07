'use client';

import { CalendarClock, Radio } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Countdown } from '@/components/ui/countdown';
import { formatDate } from '@/lib/format';

/** Homepage strip (PRD V-02, docs/02_AppFlow.md §4.1 §2): countdown that flips to "Live now" at 0. */
export function NextExamStrip({
  exam,
  serverNow,
}: {
  exam: { title: string; chapterLabel: string | null; startsAt: string; liveEndsAt: string };
  serverNow: string;
}) {
  const t = useTranslations('home.strip');
  const locale = useLocale() as 'bn' | 'en';
  const [live, setLive] = useState(() => Date.parse(exam.startsAt) <= Date.parse(serverNow));
  const name = exam.chapterLabel ? `${exam.chapterLabel}: ${exam.title}` : exam.title;

  if (live) {
    return (
      <Link
        href="/login"
        className="flex flex-wrap items-center gap-3 rounded-lg bg-danger-soft p-4 text-danger focus-visible:outline-2 focus-visible:outline-focus-ring"
      >
        <Radio aria-hidden className="size-5" />
        <span className="font-semibold">{t('liveLogin')}</span>
        <span className="text-fg">{name}</span>
      </Link>
    );
  }
  return (
    <Link
      href="/routine"
      className="flex flex-col gap-3 rounded-lg bg-surface p-4 shadow-sm transition-colors duration-120 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-focus-ring sm:flex-row sm:items-center sm:justify-between"
    >
      <span className="flex items-start gap-3">
        <CalendarClock aria-hidden className="mt-0.5 size-5 shrink-0 text-primary" />
        <span>
          <span className="block text-sm font-semibold text-fg-muted">{t('next')}</span>
          <span className="block font-semibold text-fg">{name}</span>
          <span className="block text-sm text-fg-muted">{formatDate(exam.startsAt, locale, 'dateTime')}</span>
        </span>
      </span>
      <span className="flex flex-col gap-1 sm:items-end">
        <span className="text-xs font-medium text-fg-subtle">{t('startsIn')}</span>
        <Countdown variant="tiles" target={exam.startsAt} serverNow={serverNow} onComplete={() => setLive(true)} />
      </span>
    </Link>
  );
}
