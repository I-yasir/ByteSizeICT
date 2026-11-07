'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from '@/lib/i18n/client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Countdown } from '@/components/ui/countdown';
import { notify } from '@/components/ui/toast';
import { useErrorMessage } from '@/components/ui/use-error-message';

/** Lobby primary action (docs/02_AppFlow.md §5.3): upcoming → disabled countdown → Start without reload. */
export function StartExamButton({ examId, startsAt, serverNow, upcoming, label }: { examId: string; startsAt: string; serverNow: string; upcoming: boolean; label: string }) {
  const t = useTranslations('lobby');
  const errorText = useErrorMessage();
  const router = useRouter();
  const [waiting, setWaiting] = useState(upcoming);
  const [starting, setStarting] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  async function start() {
    setStarting(true);
    try {
      const response = await fetch(`/api/exams/${examId}/start`, { method: 'POST' });
      const body = (await response.json()) as { ok: boolean; data?: { attemptId: string }; error?: { code: string; message: string } };
      if (body.ok && body.data) {
        router.replace(`/attempts/${body.data.attemptId}`);
        return;
      }
      if (body.error?.code === 'ACCESS_INACTIVE') return router.replace('/renew');
      if (body.error?.code === 'UNAUTHENTICATED' || body.error?.code === 'SESSION_REVOKED') return router.replace(`/login?next=/exams/${examId}`);
      if (body.error?.code === 'EXAM_NOT_AVAILABLE') setUnavailable(true);
      notify.error(errorText(body.error ?? null));
    } catch {
      notify.error(t('network'));
    }
    setStarting(false);
  }

  if (unavailable) return <p className="text-base font-semibold text-danger">{errorText({ message: 'errors.examNotAvailable' })}</p>;
  if (waiting) {
    return (
      <Button size="lg" fullWidth disabled>
        {t('startsIn')} <Countdown target={startsAt} serverNow={serverNow} onComplete={() => setWaiting(false)} />
      </Button>
    );
  }
  return (
    <Button size="lg" fullWidth loading={starting} onClick={start}>
      {label}
    </Button>
  );
}
