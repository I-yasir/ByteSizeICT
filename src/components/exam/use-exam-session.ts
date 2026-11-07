'use client';

import { track } from '@vercel/analytics';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AnswerChange, OptionKey } from '@/types/domain';
import {
  clearLocal,
  type Entry,
  loadLocal,
  mergeAnswers,
  nextSelection,
  purgeStale,
  saveLocal,
  type SendOutcome,
  SyncQueue,
  type SyncStatus,
} from './exam-store';

/**
 * Exam session state machine (docs/02_AppFlow.md §3.7, TRD §8). Modes:
 * - live: server attempt; local-first store + sync queue; server-timed deadline
 * - sample: local only; client timer; stateless server scoring on submit
 * - preview: admin read-only; nothing persisted, no timer
 */
export type ExamMode = 'live' | 'sample' | 'preview';
export type Phase = 'ready' | 'confirming' | 'submitting' | 'retry' | 'done';
export type Modal = 'revoked' | 'inactive' | null;

export type SessionConfig = {
  mode: ExamMode;
  storageKey: string;
  questionIds: string[];
  durationMinutes: number;
  attemptId?: string;
  deadlineAt?: string;
  serverNow?: string;
  savedAnswers?: Record<string, Entry>;
  lastQuestionIndex?: number;
};

export const SAMPLE_RESULT_KEY = 'bsi:sample-result';
const SUBMIT_RETRY_WINDOW_MS = 60_000;

function initialState(config: SessionConfig) {
  if (config.mode === 'preview') return { answers: {}, pending: [] as AnswerChange[], seq: 0, scrollQ: 0, startedAt: null as number | null };
  const local = loadLocal(config.storageKey);
  if (config.mode === 'sample') {
    return {
      answers: local?.answers ?? {},
      pending: [],
      seq: local?.seq ?? 0,
      scrollQ: local?.scrollQ ?? 0,
      startedAt: local?.startedAt ? Date.parse(local.startedAt) : Date.now(),
    };
  }
  const merged = mergeAnswers(config.savedAnswers ?? {}, local?.answers);
  return {
    answers: merged.answers,
    pending: merged.pending,
    seq: Math.max(merged.seq, local?.seq ?? 0),
    scrollQ: local?.scrollQ ?? config.lastQuestionIndex ?? 0,
    startedAt: null,
  };
}

export function useExamSession(config: SessionConfig) {
  const router = useRouter();
  const [init] = useState(() => initialState(config));
  const [answers, setAnswers] = useState<Record<string, Entry>>(init.answers);
  const answersRef = useRef(answers);
  const seqRef = useRef(init.seq);
  const scrollRef = useRef(init.scrollQ);
  const [sync, setSync] = useState<SyncStatus>({ state: init.pending.length ? 'pending' : 'synced', pending: init.pending.length });
  const [phase, setPhase] = useState<Phase>('ready');
  const [autoSubmitting, setAutoSubmitting] = useState(false);
  const [retryExpired, setRetryExpired] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  const submittingRef = useRef(false);

  // Server-synchronised deadline (TRD §8.7): remaining = deadline − (now + offset).
  const [deadline] = useState<number | null>(() => {
    if (config.mode === 'live' && config.deadlineAt && config.serverNow) {
      const offset = Date.parse(config.serverNow) - Date.now();
      return Date.parse(config.deadlineAt) - offset;
    }
    if (config.mode === 'sample' && init.startedAt) return init.startedAt + config.durationMinutes * 60_000;
    return null;
  });
  const [remainingMs, setRemainingMs] = useState<number | null>(() => (deadline === null ? null : deadline - Date.now()));

  const persist = useCallback(
    (next: Record<string, Entry>) => {
      if (config.mode === 'preview') return;
      saveLocal(config.storageKey, {
        seq: seqRef.current,
        answers: next,
        scrollQ: scrollRef.current,
        ...(config.mode === 'sample' && init.startedAt ? { startedAt: new Date(init.startedAt).toISOString() } : {}),
      });
    },
    [config.mode, config.storageKey, init.startedAt],
  );

  const submitRef = useRef<(auto: boolean) => Promise<void>>(async () => {});

  const [queue] = useState(() =>
    config.mode !== 'live' || !config.attemptId
      ? null
      : new SyncQueue({
          send: async (changes, { keepalive }): Promise<SendOutcome> => {
            try {
              const response = await fetch(`/api/attempts/${config.attemptId}/answers`, {
                method: 'PUT',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ changes, lastQuestionIndex: scrollRef.current }),
                keepalive,
              });
              if (response.ok) return 'ok';
              if (response.status === 409) return 'closed';
              if (response.status === 401) return 'revoked';
              if (response.status === 403) {
                const body = (await response.json().catch(() => null)) as { error?: { code?: string } } | null;
                return body?.error?.code === 'ACCESS_INACTIVE' ? 'inactive' : 'revoked';
              }
              if (response.status === 422) return 'invalid';
              return 'network';
            } catch {
              return 'network';
            }
          },
          onStatus: setSync,
          onTerminal: (outcome) => {
            if (outcome === 'closed') void submitRef.current(true);
            else setModal(outcome);
          },
        }),
  );

  const select = useCallback(
    (questionId: string, key: OptionKey) => {
      if (submittingRef.current) return;
      const current = answersRef.current[questionId];
      seqRef.current += 1;
      const entry: Entry = { o: nextSelection(current?.o ?? null, key), m: current?.m ?? false, s: seqRef.current };
      const next = { ...answersRef.current, [questionId]: entry };
      answersRef.current = next;
      setAnswers(next);
      persist(next);
      queue?.enqueue({ q: questionId, ...entry });
    },
    [persist, queue],
  );

  const toggleMark = useCallback(
    (questionId: string) => {
      if (submittingRef.current) return;
      const current = answersRef.current[questionId];
      seqRef.current += 1;
      const entry: Entry = { o: current?.o ?? null, m: !(current?.m ?? false), s: seqRef.current };
      const next = { ...answersRef.current, [questionId]: entry };
      answersRef.current = next;
      setAnswers(next);
      persist(next);
      queue?.enqueue({ q: questionId, ...entry });
    },
    [persist, queue],
  );

  const setScrollIndex = useCallback((index: number) => {
    scrollRef.current = index;
  }, []);

  const submit = useCallback(
    async (auto: boolean) => {
      if (config.mode === 'preview' || submittingRef.current) return;
      submittingRef.current = true;
      setAutoSubmitting(auto);
      setPhase('submitting');
      setRetryExpired(false);

      if (config.mode === 'sample') {
        try {
          const payload = Object.fromEntries(Object.entries(answersRef.current).map(([q, e]) => [q, e.o]));
          const response = await fetch('/api/sample/score', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ answers: payload }),
          });
          const body = (await response.json()) as { ok: boolean; data?: unknown };
          if (!body.ok) throw new Error('score failed');
          sessionStorage.setItem(SAMPLE_RESULT_KEY, JSON.stringify(body.data));
          clearLocal(config.storageKey);
          track('sample_complete');
          setPhase('done');
          router.push('/sample/result');
        } catch {
          submittingRef.current = false;
          setPhase('retry');
          setRetryExpired(true);
        }
        return;
      }

      queue?.stop();
      const changes: AnswerChange[] = Object.entries(answersRef.current)
        .filter(([, entry]) => entry.s > 0)
        .map(([q, entry]) => ({ q, o: entry.o, m: entry.m, s: entry.s }));
      const startedAt = Date.now();
      let delay = 1000;
      for (;;) {
        try {
          const response = await fetch(`/api/attempts/${config.attemptId}/submit`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ auto, changes }),
          });
          const body = (await response.json().catch(() => null)) as { ok: boolean; data?: { resultUrl: string }; error?: { code: string; meta?: { resultUrl?: string } } } | null;
          if (body?.ok && body.data) {
            clearLocal(config.storageKey);
            setPhase('done');
            router.replace(body.data.resultUrl);
            return;
          }
          if (response.status === 409) {
            clearLocal(config.storageKey);
            setPhase('done');
            router.replace(body?.error?.meta?.resultUrl ?? `/attempts/${config.attemptId}/result`);
            return;
          }
          if (response.status === 401 || response.status === 403) {
            submittingRef.current = false;
            setPhase('ready');
            setModal('revoked');
            return;
          }
        } catch {
          /* network: retry below */
        }
        setPhase('retry');
        if (Date.now() - startedAt > SUBMIT_RETRY_WINDOW_MS) {
          setRetryExpired(true);
          submittingRef.current = false;
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay = Math.min(delay * 2, 3000);
      }
    },
    [config.attemptId, config.mode, config.storageKey, queue, router],
  );

  useEffect(() => {
    submitRef.current = submit;
  }, [submit]);

  // Timer tick + auto-submit at zero (no dialog).
  useEffect(() => {
    if (deadline === null) return;
    let fired = false;
    const tick = () => {
      const left = deadline - Date.now();
      setRemainingMs(left);
      if (left <= 0 && !fired) {
        fired = true;
        void submitRef.current(true);
      }
    };
    const id = setInterval(tick, 250);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [deadline]);

  // Push local-newer answers once, wire online/visibility/beforeunload, persist scroll position.
  useEffect(() => {
    purgeStale();
    if (!queue) return;
    for (const change of init.pending) queue.enqueue(change);
    if (init.pending.length) void queue.flush();

    const onOnline = () => void queue.flush();
    const onHide = () => {
      if (document.visibilityState === 'hidden') {
        persist(answersRef.current);
        void queue.flush({ keepalive: true });
      }
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (queue.pendingCount > 0 && !submittingRef.current) event.preventDefault();
    };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [init.pending, persist, queue]);

  useEffect(() => {
    if (config.mode === 'preview') return;
    let last = scrollRef.current;
    const id = setInterval(() => {
      if (scrollRef.current !== last) {
        last = scrollRef.current;
        persist(answersRef.current);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [config.mode, persist]);

  return {
    answers,
    select,
    toggleMark,
    sync,
    phase,
    setPhase,
    submit,
    autoSubmitting,
    retryExpired,
    modal,
    remainingMs,
    initialScrollIndex: init.scrollQ,
    setScrollIndex,
  };
}
