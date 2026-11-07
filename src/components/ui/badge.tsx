import { cva, type VariantProps } from 'class-variance-authority';
import { Lock } from 'lucide-react';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** docs/03_UI_Spec.md §7.5 */
export const badgeVariants = cva('inline-flex h-6 items-center gap-1 rounded-sm px-2 text-xs font-semibold whitespace-nowrap', {
  variants: {
    variant: {
      success: 'bg-success-soft text-success',
      danger: 'bg-danger-soft text-danger',
      warning: 'bg-warning-soft text-warning',
      info: 'bg-info-soft text-info',
      teal: 'bg-teal-soft text-teal',
      neutral: 'bg-neutral-status-soft text-neutral-status',
      primary: 'bg-primary-soft text-primary',
      'danger-outline': 'border border-danger bg-transparent text-danger',
    },
  },
  defaultVariants: { variant: 'neutral' },
});

export function Badge({ className, variant, ...props }: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export type StatusKind = 'upcoming' | 'live' | 'completed' | 'missed' | 'locked' | 'correct' | 'incorrect' | 'skipped';

const STATUS: Record<StatusKind, { variant: VariantProps<typeof badgeVariants>['variant']; icon?: ReactNode }> = {
  upcoming: { variant: 'warning' },
  live: {
    variant: 'danger',
    icon: (
      <span aria-hidden className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-danger opacity-60" />
        <span className="relative inline-flex size-2 rounded-full bg-danger" />
      </span>
    ),
  },
  completed: { variant: 'success' },
  missed: { variant: 'danger-outline' },
  locked: { variant: 'neutral', icon: <Lock aria-hidden className="size-3" /> },
  correct: { variant: 'success' },
  incorrect: { variant: 'danger' },
  skipped: { variant: 'info' },
};

/** Exam card / review status tags. The label is passed in so it stays translated. */
export function StatusTag({ status, children, className }: { status: StatusKind; children: ReactNode; className?: string }) {
  const { variant, icon } = STATUS[status];
  return (
    <Badge variant={variant} className={className}>
      {icon}
      {children}
    </Badge>
  );
}
