'use client';

import { AlarmClock, Clock, Cloud, CloudOff, LoaderCircle, LogIn, RefreshCw, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogActions, DialogClose, DialogContent } from '@/components/ui/dialog';
import { scrollBehavior, useOnline } from '@/components/ui/hooks';
import { Banner } from '@/components/ui/misc';
import { ScrollTopButton } from '@/components/ui/scroll-top';
import { cn } from '@/lib/utils';
import type { OptionKey, PaperQuestion } from '@/types/domain';
import { type Entry, formatClock, timerState } from './exam-store';
import { QuestionCard } from './question-card';
import { type NavItem, QuestionNavigator } from './question-navigator';
import { type ExamMode, useExamSession } from './use-exam-session';

export type ExamPageProps = {
  mode: ExamMode;
  title: string;
  questions: PaperQuestion[];
  durationMinutes: number;
  marksPerQuestion: number;
  negativeMark: number;
  allowMarkForReview: boolean;
  attemptId?: string;
  deadlineAt?: string;
  serverNow?: string;
  savedAnswers?: Record<string, Entry>;
  lastQuestionIndex?: number;
  /** Admin preview only: canonical answer key per question id. */
  answerKey?: Record<string, OptionKey>;
};

const FIRST_CHUNK = 15;
const CHUNK = 20;

/** Single scrolling exam page (PRD S-06…S-09, docs/02_AppFlow.md §5.4, UI Spec §7.6–7.10). */
export default function ExamPage(props: ExamPageProps) {
  const t = useTranslations('examPage');
  const online = useOnline();
  const total = props.questions.length;
  const session = useExamSession({
    mode: props.mode,
    storageKey: props.mode === 'live' ? `bsi:attempt:${props.attemptId}` : 'bsi:sample',
    questionIds: props.questions.map((q) => q.id),
    durationMinutes: props.durationMinutes,
    ...(props.attemptId ? { attemptId: props.attemptId } : {}),
    ...(props.deadlineAt ? { deadlineAt: props.deadlineAt } : {}),
    ...(props.serverNow ? { serverNow: props.serverNow } : {}),
    ...(props.savedAnswers ? { savedAnswers: props.savedAnswers } : {}),
    ...(props.lastQuestionIndex !== undefined ? { lastQuestionIndex: props.lastQuestionIndex } : {}),
  });
  const { answers, phase, remainingMs } = session;
  const [showKey, setShowKey] = useState(false);

  // Chunked rendering (TRD §8.10): first chunk (or up to the resume position) now, the rest when idle.
  const [rendered, setRendered] = useState(() => Math.min(total, Math.max(FIRST_CHUNK, session.initialScrollIndex + 5)));
  useEffect(() => {
    if (rendered >= total) return;
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 50));
    const cancel = window.cancelIdleCallback ?? window.clearTimeout;
    const id = idle(() => setRendered((r) => Math.min(total, r + CHUNK)));
    return () => cancel(id);
  }, [rendered, total]);

  // Resume the scroll position once.
  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current) return;
    resumed.current = true;
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    if (session.initialScrollIndex > 0) {
      // Browser/router scroll restoration can run after mount; scroll again once layout settles.
      const go = () => document.getElementById(`q-${session.initialScrollIndex + 1}`)?.scrollIntoView({ block: 'start' });
      requestAnimationFrame(go);
      setTimeout(go, 300);
    }
  }, [session.initialScrollIndex]);

  // Track the question nearest the top (navigator "current", resume position).
  const [current, setCurrent] = useState(session.initialScrollIndex + 1);
  const { setScrollIndex } = session;
  useEffect(() => {
    // Entries only report changes, so keep the full visible set across callbacks.
    const visible = new Set<number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const i = Number((e.target as HTMLElement).dataset.index);
          if (e.isIntersecting) visible.add(i);
          else visible.delete(i);
        }
        if (visible.size) {
          const index = Math.min(...visible);
          setCurrent(index + 1);
          setScrollIndex(index);
        }
      },
      { rootMargin: '-120px 0px -55% 0px' },
    );
    document.querySelectorAll('article[data-index]').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [rendered, setScrollIndex]);

  const jump = useCallback(
    (n: number) => {
      if (n > rendered) setRendered(total);
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const el = document.getElementById(`q-${n}`);
          el?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
          el?.focus({ preventScroll: true });
        }),
      );
    },
    [rendered, total],
  );

  const answered = useMemo(() => props.questions.filter((q) => answers[q.id]?.o).length, [answers, props.questions]);
  const marked = useMemo(() => props.questions.filter((q) => answers[q.id]?.m).length, [answers, props.questions]);
  const navItems: NavItem[] = useMemo(
    () => props.questions.map((q) => ({ n: q.n, state: answers[q.id]?.o ? 'answered' : 'unanswered', marked: Boolean(answers[q.id]?.m) })),
    [answers, props.questions],
  );
  const firstUnanswered = props.questions.find((q) => !answers[q.id]?.o)?.n ?? null;

  const timer = remainingMs === null ? null : timerState(remainingMs);
  const disabled = phase === 'submitting' || phase === 'retry' || phase === 'done';
  const offline = props.mode === 'live' && (!online || session.sync.state === 'offline') && session.sync.pending > 0;

  // Screen reader milestones (UI Spec §7.6) — announced once each.
  const [announcement, setAnnouncement] = useState('');
  const announced = useRef({ five: false, one: false });
  useEffect(() => {
    if (remainingMs === null) return;
    if (remainingMs <= 300_000 && !announced.current.five) {
      announced.current.five = true;
      queueMicrotask(() => setAnnouncement(t('fiveLeft')));
    }
    if (remainingMs <= 60_000 && !announced.current.one) {
      announced.current.one = true;
      queueMicrotask(() => setAnnouncement(t('oneLeft')));
    }
  }, [remainingMs, t]);

  const openSubmit = () => session.setPhase('confirming');
  const SyncIcon = session.sync.state === 'synced' ? Cloud : session.sync.state === 'offline' ? CloudOff : RefreshCw;

  return (
    <div className="min-h-dvh bg-bg pb-28 lg:pb-12">
      {/* 1. Sticky top bar */}
      <header className="sticky top-0 z-sticky border-b border-border bg-surface/95 shadow-md backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-exam items-center gap-3 px-4 lg:max-w-app">
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold text-fg">{props.title}</p>
          </div>
          {props.mode === 'sample' ? <Badge variant="primary">{t('freeSample')}</Badge> : null}
          {props.mode === 'preview' ? <Badge variant="warning">{t('preview')}</Badge> : null}
          {props.mode === 'live' ? (
            <span role="img" title={t(`sync.${session.sync.state}`)} aria-label={t(`sync.${session.sync.state}`)} className="text-fg-subtle">
              <SyncIcon aria-hidden className={cn('size-4', session.sync.state === 'pending' && 'animate-spin', session.sync.state === 'offline' && 'text-warning')} />
            </span>
          ) : null}
          {timer ? (
            <span
              role="timer"
              aria-live="off"
              className={cn(
                'inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 font-num text-timer tabular-nums',
                timer === 'normal' && 'bg-surface-2 text-fg',
                timer === 'warning' && 'bg-warning-soft text-warning',
                (timer === 'critical' || timer === 'expired') && 'bg-danger-soft text-danger',
                timer === 'critical' && 'animate-pulse-critical',
              )}
            >
              {timer === 'normal' ? <Clock aria-hidden className="size-4" /> : <AlarmClock aria-hidden className="size-4" />}
              {formatClock(remainingMs ?? 0)}
            </span>
          ) : (
            <span className="font-num text-sm text-fg-muted">{t('minutes', { n: props.durationMinutes })}</span>
          )}
          <span className="hidden font-num text-sm text-fg-muted sm:inline">{t('answeredCount', { x: answered, n: total })}</span>
          {props.mode !== 'preview' ? (
            <Button className="hidden lg:inline-flex" onClick={openSubmit} disabled={disabled}>
              {t('submit')}
            </Button>
          ) : null}
        </div>
        <div aria-hidden className="h-0.75 bg-surface-3">
          <div className="h-full bg-primary transition-[width] duration-180 ease-out" style={{ width: `${total ? (answered / total) * 100 : 0}%` }} />
        </div>
        {offline ? <Banner variant="offline" className="rounded-none">{t('offline')}</Banner> : null}
      </header>
      <p className="sr-only" aria-live="polite">{announcement}</p>

      <main id="main" className="mx-auto flex max-w-exam flex-col gap-3 px-4 pt-4">
        {/* 2. Info strip */}
        <div className="rounded-lg bg-surface-2 px-4 py-3 text-sm text-fg-muted">
          <p>
            {t('info', { marks: props.marksPerQuestion, n: total })}{' '}
            {props.negativeMark > 0 ? t('negative', { mark: props.negativeMark }) : t('noNegative')}
          </p>
          <p className="mt-1">{props.mode === 'preview' ? t('previewNote') : t('autosave')}</p>
          {props.mode === 'preview' && props.answerKey ? (
            <label className="mt-2 inline-flex min-h-11 items-center gap-2 font-semibold text-fg">
              <input type="checkbox" className="size-5 accent-primary" checked={showKey} onChange={(e) => setShowKey(e.target.checked)} />
              {t('showAnswers')}
            </label>
          ) : null}
        </div>

        {/* 3. Question cards */}
        {props.questions.slice(0, rendered).map((question) => (
          <QuestionCard
            key={question.id}
            question={question}
            entry={answers[question.id]}
            allowMark={props.allowMarkForReview && props.mode !== 'preview'}
            disabled={disabled}
            highlightKey={showKey ? props.answerKey?.[question.id] : undefined}
            onSelect={session.select}
            onToggleMark={session.toggleMark}
          />
        ))}
        {rendered < total ? <div className="h-40 skeleton-shimmer rounded-lg" aria-hidden /> : null}

        {/* 4. End of paper */}
        <section className="mt-4 flex flex-col items-center gap-3 rounded-lg bg-surface p-6 text-center shadow-sm">
          <p className="text-lg font-semibold text-fg">{t('end')}</p>
          <p className="font-num text-sm text-fg-muted">{t('answeredCount', { x: answered, n: total })}</p>
          {props.mode !== 'preview' ? (
            <Button size="lg" onClick={openSubmit} disabled={disabled}>
              {t('submit')}
            </Button>
          ) : null}
        </section>
      </main>

      {/* 5. Sticky bottom bar (mobile) */}
      {props.mode !== 'preview' ? (
        <div className="fixed inset-x-0 bottom-0 z-sticky border-t border-border bg-surface pb-safe shadow-md lg:hidden">
          <div className="mx-auto flex h-18 max-w-exam items-center justify-between gap-3 px-4">
            <span className="font-num text-sm text-fg-muted">{t('answeredCount', { x: answered, n: total })}</span>
            <Button size="lg" className="min-w-36" onClick={openSubmit} disabled={disabled}>
              {t('submit')}
            </Button>
          </div>
        </div>
      ) : null}

      {/* 6–7. Navigator + scroll-to-top */}
      <QuestionNavigator items={navItems} current={current} onJump={jump} badge={total - answered} className="bottom-24" />
      <ScrollTopButton className="bottom-24 lg:bottom-6" />

      {/* Submit confirmation */}
      <Dialog open={phase === 'confirming'} onOpenChange={(open) => !open && session.setPhase('ready')}>
        <DialogContent title={t('confirmTitle')}>
          <dl className="grid grid-cols-3 gap-2 text-center">
            {[
              [t('answered'), answered, 'text-primary'],
              [t('unanswered'), total - answered, 'text-fg'],
              [t('marked'), marked, 'text-warning'],
            ].map(([label, value, color]) => (
              <div key={label as string} className="rounded-md bg-surface-2 p-3">
                <dt className="text-xs text-fg-muted">{label}</dt>
                <dd className={cn('font-num text-2xl font-bold', color as string)}>{value}</dd>
              </div>
            ))}
          </dl>
          <DialogActions>
            {firstUnanswered ? (
              <Button
                variant="ghost"
                onClick={() => {
                  session.setPhase('ready');
                  jump(firstUnanswered);
                }}
              >
                {t('reviewUnanswered')}
              </Button>
            ) : null}
            <DialogClose asChild>
              <Button variant="secondary">{t('cancel')}</Button>
            </DialogClose>
            <Button onClick={() => void session.submit(false)}>{t('submit')}</Button>
          </DialogActions>
        </DialogContent>
      </Dialog>

      {/* Submitting / retry overlay */}
      {phase === 'submitting' || phase === 'retry' || phase === 'done' ? (
        <div role="alertdialog" aria-modal="true" aria-live="assertive" className="fixed inset-0 z-submit-overlay flex flex-col items-center justify-center gap-4 bg-overlay p-6">
          <div className="flex max-w-sm flex-col items-center gap-3 rounded-xl bg-surface p-6 text-center shadow-lg">
            {session.retryExpired ? <CloudOff aria-hidden className="size-8 text-warning" /> : <LoaderCircle aria-hidden className="size-8 animate-spin text-primary" />}
            <p className="text-lg font-semibold text-fg">
              {session.retryExpired ? t('submitFailed') : session.autoSubmitting ? t('timeUp') : t('submitting')}
            </p>
            {phase === 'retry' && !session.retryExpired ? <p className="text-sm text-fg-muted">{t('dontClose')}</p> : null}
            {session.retryExpired ? (
              <>
                <p className="text-sm text-fg-muted">{t('savedOnDevice')}</p>
                <Button onClick={() => void session.submit(session.autoSubmitting)}>{t('tryAgain')}</Button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Session revoked / access inactive */}
      <Dialog open={session.modal !== null}>
        <DialogContent
          blocking
          title={session.modal === 'inactive' ? t('inactiveTitle') : t('revokedTitle')}
          description={session.modal === 'inactive' ? t('inactiveBody') : t('revokedBody')}
        >
          <DialogActions>
            {session.modal === 'inactive' ? (
              <Button asChild leadingIcon={<ShieldAlert aria-hidden className="size-5" />}>
                <Link href="/renew">{t('goRenew')}</Link>
              </Button>
            ) : (
              <Button asChild leadingIcon={<LogIn aria-hidden className="size-5" />}>
                <Link href={`/login?next=${encodeURIComponent(`/attempts/${props.attemptId ?? ''}`)}`}>{t('loginAgain')}</Link>
              </Button>
            )}
          </DialogActions>
        </DialogContent>
      </Dialog>
    </div>
  );
}
