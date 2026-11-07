'use client';

import { useTranslations } from '@/lib/i18n/client';
import { useEffect, useRef, useState } from 'react';
import { countdownSegments } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * docs/03_UI_Spec.md §7.20 — DD:HH:MM:SS with leading zero units dropped. Uses the server clock
 * (`serverNow` from the render) so a wrong device clock does not change the countdown.
 */
export function Countdown({
  target,
  serverNow,
  variant = 'inline',
  onComplete,
  className,
}: {
  target: string;
  serverNow: string;
  variant?: 'inline' | 'tiles';
  onComplete?: () => void;
  className?: string;
}) {
  const t = useTranslations('countdown');
  const offset = useRef<number | null>(null);
  const [remaining, setRemaining] = useState(() => Date.parse(target) - Date.parse(serverNow));
  const completed = useRef(false);

  useEffect(() => {
    offset.current ??= Date.parse(serverNow) - Date.now();
    const tick = () => {
      const left = Date.parse(target) - (Date.now() + (offset.current ?? 0));
      setRemaining(left);
      if (left <= 0 && !completed.current) {
        completed.current = true;
        onComplete?.();
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target, serverNow, onComplete]);

  const segments = countdownSegments(remaining);
  const label = segments.map(([value, unit]) => `${value} ${t(unit)}`).join(' ');

  if (variant === 'tiles') {
    return (
      <span role="timer" aria-label={label} className={cn('inline-flex items-center gap-1.5', className)}>
        {segments.map(([value, unit], index) => (
          <span key={unit} className="inline-flex items-center gap-1.5">
            {index > 0 ? <span aria-hidden className="font-num font-semibold text-fg-subtle">:</span> : null}
            <span aria-hidden className="flex min-w-11 flex-col items-center rounded-md bg-surface-2 px-2 py-1">
              <span className="font-num text-lg font-bold text-fg tabular-nums">{value}</span>
              <span className="text-xs text-fg-subtle">{t(unit)}</span>
            </span>
          </span>
        ))}
      </span>
    );
  }
  return (
    <span role="timer" aria-label={label} className={cn('font-num font-semibold tabular-nums', className)}>
      {segments.map(([value]) => value).join(':')}
    </span>
  );
}
