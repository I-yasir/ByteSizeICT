'use client';

import { Check, ChevronDown } from 'lucide-react';
import { Accordion as A, Checkbox as C, DropdownMenu as M, RadioGroup as R, Tabs as T } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Thin, token-styled wrappers over Radix primitives (docs/03_UI_Spec.md §7). */

export function Checkbox({ label, className, ...props }: ComponentProps<typeof C.Root> & { label: ReactNode }) {
  return (
    <label className={cn('inline-flex min-h-12 cursor-pointer items-center gap-3 text-base text-fg', className)}>
      <C.Root
        className="flex size-5 shrink-0 items-center justify-center rounded-sm border-2 border-border-strong bg-surface transition-colors duration-120 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring data-[state=checked]:border-primary data-[state=checked]:bg-primary"
        {...props}
      >
        <C.Indicator>
          <Check aria-hidden className="size-3.5 text-on-primary" strokeWidth={3} />
        </C.Indicator>
      </C.Root>
      <span>{label}</span>
    </label>
  );
}

export const Tabs = T.Root;
export function TabsList({ className, ...props }: ComponentProps<typeof T.List>) {
  return <T.List className={cn('flex gap-1 overflow-x-auto border-b border-border', className)} {...props} />;
}
export function TabsTrigger({ className, ...props }: ComponentProps<typeof T.Trigger>) {
  return (
    <T.Trigger
      className={cn(
        'h-11 shrink-0 border-b-2 border-transparent px-4 text-sm font-semibold text-fg-muted transition-colors duration-120',
        'hover:text-fg focus-visible:outline-2 focus-visible:outline-focus-ring data-[state=active]:border-primary data-[state=active]:text-primary',
        className,
      )}
      {...props}
    />
  );
}
export const TabsContent = T.Content;

export const DropdownMenu = M.Root;
export const DropdownMenuTrigger = M.Trigger;
export function DropdownMenuContent({ className, ...props }: ComponentProps<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content
        sideOffset={6}
        className={cn('z-dropdown min-w-48 rounded-md border border-border bg-surface p-1 shadow-md', className)}
        {...props}
      />
    </M.Portal>
  );
}
export function DropdownMenuItem({ className, ...props }: ComponentProps<typeof M.Item>) {
  return (
    <M.Item
      className={cn(
        'flex min-h-11 cursor-pointer items-center gap-2 rounded-sm px-3 text-sm text-fg outline-none select-none data-[highlighted]:bg-surface-2 data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

/** FAQ accordion. */
export const Accordion = A.Root;
export function AccordionItem({ question, children, value }: { question: ReactNode; children: ReactNode; value: string }) {
  return (
    <A.Item value={value} className="border-b border-border last:border-b-0">
      <A.Header>
        <A.Trigger className="group flex min-h-14 w-full items-center justify-between gap-4 py-3 text-left text-base font-semibold text-fg focus-visible:outline-2 focus-visible:outline-focus-ring">
          {question}
          <ChevronDown aria-hidden className="size-5 shrink-0 text-fg-muted transition-transform duration-180 group-data-[state=open]:rotate-180" />
        </A.Trigger>
      </A.Header>
      <A.Content className="pb-4 text-base text-fg-muted">{children}</A.Content>
    </A.Item>
  );
}

/** Selectable cards (plan picker) and segmented control (payment method). */
export const RadioCards = R.Root;
export function RadioCard({ className, children, ...props }: ComponentProps<typeof R.Item>) {
  return (
    <R.Item
      className={cn(
        'relative flex w-full rounded-lg border border-border-strong bg-surface p-4 text-left transition-colors duration-120',
        'hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
        'data-[state=checked]:border-primary-soft-border data-[state=checked]:bg-primary-soft data-[state=checked]:ring-2 data-[state=checked]:ring-primary data-[state=checked]:ring-inset',
        className,
      )}
      {...props}
    >
      {children}
    </R.Item>
  );
}

export function Segmented({ className, ...props }: ComponentProps<typeof R.Root>) {
  return <R.Root className={cn('grid grid-cols-2 gap-2 sm:grid-cols-4', className)} {...props} />;
}
export function SegmentedItem({ className, children, ...props }: ComponentProps<typeof R.Item>) {
  return (
    <R.Item
      className={cn(
        'flex h-12 items-center justify-center rounded-md border border-border-strong bg-surface px-3 text-sm font-semibold text-fg transition-colors duration-120',
        'hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
        'data-[state=checked]:border-primary data-[state=checked]:bg-primary-soft data-[state=checked]:text-primary',
        className,
      )}
      {...props}
    >
      {children}
    </R.Item>
  );
}
