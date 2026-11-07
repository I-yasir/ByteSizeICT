import { cva, type VariantProps } from 'class-variance-authority';
import { CircleAlert, Info, WifiOff } from 'lucide-react';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** docs/03_UI_Spec.md §7.13 */
const bannerVariants = cva('flex w-full items-start gap-2 px-4 py-2.5 text-sm', {
  variants: {
    variant: {
      offline: 'bg-warning-soft text-warning',
      info: 'bg-info-soft text-info',
      danger: 'bg-danger-soft text-danger',
      success: 'bg-success-soft text-success',
    },
  },
  defaultVariants: { variant: 'info' },
});

const BANNER_ICON = { offline: WifiOff, info: Info, danger: CircleAlert, success: Info } as const;

export function Banner({
  variant = 'info',
  children,
  action,
  className,
  role,
}: VariantProps<typeof bannerVariants> & { children: ReactNode; action?: ReactNode; className?: string; role?: 'alert' | 'status' }) {
  const Icon = BANNER_ICON[variant ?? 'info'];
  return (
    <div role={role ?? (variant === 'danger' ? 'alert' : 'status')} className={cn(bannerVariants({ variant }), 'rounded-md', className)}>
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  );
}

/** docs/03_UI_Spec.md §7.17 */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden className={cn('skeleton-shimmer rounded-md', className)} {...props} />;
}

/** docs/03_UI_Spec.md §7.18 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center gap-3 px-4 py-10 text-center', className)}>
      <div aria-hidden className="flex size-24 items-center justify-center rounded-full bg-surface-2 text-fg-subtle *:size-10">
        {icon}
      </div>
      <h2 className="text-lg font-semibold text-fg">{title}</h2>
      {description ? <p className="max-w-xs text-sm text-fg-muted">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/** Page section heading used across public and app pages. */
export function SectionHeading({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-2xl font-bold text-fg lg:text-3xl">{title}</h2>
        {subtitle ? <p className="mt-1 text-base text-fg-muted">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}
