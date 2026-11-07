import { CircleCheck, CircleSlash, CircleX, Target } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/** Marks ring + analysis cards (docs/02_AppFlow.md §5.5, UI Spec §7.14). Labels are passed in translated. */
export type SummaryLabels = {
  marks: string;
  correct: string;
  incorrect: string;
  skipped: string;
  accuracy: string;
  analysis: string;
};

export function percentBand(percent: number): 'success' | 'primary' | 'warning' | 'danger' {
  if (percent >= 80) return 'success';
  if (percent >= 50) return 'primary';
  if (percent >= 33) return 'warning';
  return 'danger';
}

const RING = { success: 'stroke-success', primary: 'stroke-primary', warning: 'stroke-warning', danger: 'stroke-danger' } as const;
const TEXT = { success: 'text-success', primary: 'text-primary', warning: 'text-warning', danger: 'text-danger' } as const;

export function MarksRing({ score, total, scoreText, totalText, label }: { score: number; total: number; scoreText: string; totalText: string; label: string }) {
  const percent = total > 0 ? Math.max(0, (score / total) * 100) : 0;
  const band = percentBand(percent);
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative size-30 shrink-0" role="img" aria-label={`${label}: ${scoreText}/${totalText}`}>
      <svg viewBox="0 0 120 120" className="size-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" strokeWidth="10" className="stroke-stat-bar-track" />
        <circle cx="60" cy="60" r={r} fill="none" strokeWidth="10" strokeLinecap="round" className={RING[band]} strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(percent, 100) / 100)} />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn('font-num text-3xl font-bold', TEXT[band])}>{scoreText}</span>
        <span className="font-num text-sm text-fg-muted">/{totalText}</span>
      </span>
    </div>
  );
}

export function AnalysisCards({ labels, values }: { labels: SummaryLabels; values: { correct: string; incorrect: string; skipped: string; accuracy: string } }) {
  const cards: { label: string; value: string; Icon: typeof Target; className: string }[] = [
    { label: labels.correct, value: values.correct, Icon: CircleCheck, className: 'bg-success-soft text-success' },
    { label: labels.incorrect, value: values.incorrect, Icon: CircleX, className: 'bg-danger-soft text-danger' },
    { label: labels.skipped, value: values.skipped, Icon: CircleSlash, className: 'bg-info-soft text-info' },
    { label: labels.accuracy, value: values.accuracy, Icon: Target, className: 'bg-teal-soft text-teal' },
  ];
  return (
    <section aria-label={labels.analysis} className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {cards.map(({ label, value, Icon, className }) => (
        <div key={label} className={cn('flex flex-col gap-1 rounded-lg p-4', className)}>
          <span className="flex items-center gap-1.5 text-sm font-semibold"><Icon aria-hidden className="size-5" />{label}</span>
          <span className="font-num text-2xl font-bold">{value}</span>
        </div>
      ))}
    </section>
  );
}

export function SummaryCard({ title, subtitle, ring, children, lateBadge }: { title: string; subtitle?: string | null; ring: ReactNode; children?: ReactNode; lateBadge?: string | null }) {
  return (
    <Card className="flex flex-col gap-4 sm:flex-row sm:items-center">
      {ring}
      <div className="min-w-0 flex-1">
        {subtitle ? <p className="text-sm text-fg-muted">{subtitle}</p> : null}
        <h1 className="text-xl font-bold text-fg">{title}</h1>
        {lateBadge ? <Badge variant="warning" className="mt-2">{lateBadge}</Badge> : null}
        <div className="mt-3 flex flex-col gap-1 text-base text-fg">{children}</div>
      </div>
    </Card>
  );
}
