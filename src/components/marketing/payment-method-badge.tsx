import { cn } from '@/lib/utils';

/** Placeholder method marks (docs/03_UI_Spec.md §6): coloured letter badges until official SVGs are provided. */
const STYLE = {
  bkash: { letter: 'b', className: 'bg-danger-soft text-danger' },
  nagad: { letter: 'N', className: 'bg-warning-soft text-warning' },
  rocket: { letter: 'R', className: 'bg-primary-soft text-primary' },
  bank: { letter: 'B', className: 'bg-info-soft text-info' },
} as const;

export const METHOD_LABEL = { bkash: 'bKash', nagad: 'Nagad', rocket: 'Rocket', bank: 'Bank' } as const;

export function PaymentMethodBadge({ method, className }: { method: keyof typeof STYLE; className?: string }) {
  const { letter, className: color } = STYLE[method];
  return (
    <span aria-hidden className={cn('flex size-10 shrink-0 items-center justify-center rounded-md font-num text-lg font-bold', color, className)}>
      {letter}
    </span>
  );
}
