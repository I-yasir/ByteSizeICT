import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/** docs/03_UI_Spec.md §7.4 — shadow in light, hairline border in dark (via the elevation tokens). */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-lg bg-surface p-4 shadow-sm md:p-5', className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-lg font-semibold text-fg', className)} {...props} />;
}
