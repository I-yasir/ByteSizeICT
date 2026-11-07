'use client';

import { useEffect, useState } from 'react';

/** One-time confetti burst for ≥ 80 % (docs/02_AppFlow.md §5.5): CSS only, ≤ 1.5 s, none under reduced motion. */
const PIECES = Array.from({ length: 28 }, (_, i) => i);
const COLORS = ['bg-primary', 'bg-success', 'bg-warning', 'bg-teal', 'bg-info', 'bg-danger'];

export function Celebration({ storageKey }: { storageKey: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    try {
      if (sessionStorage.getItem(storageKey)) return;
      sessionStorage.setItem(storageKey, '1');
    } catch {
      /* storage blocked: still celebrate once per render */
    }
    const start = setTimeout(() => setShow(true), 0);
    const stop = setTimeout(() => setShow(false), 1600);
    return () => {
      clearTimeout(start);
      clearTimeout(stop);
    };
  }, [storageKey]);
  if (!show) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-toast h-dvh overflow-hidden">
      {PIECES.map((i) => (
        <span
          key={i}
          className={`confetti-piece absolute top-0 block size-2 rounded-sm ${COLORS[i % COLORS.length]}`}
          style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 7) * 60}ms` }}
        />
      ))}
    </div>
  );
}
