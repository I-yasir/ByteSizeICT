'use client';

import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Dialog as D } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * docs/03_UI_Spec.md §7.11 — centred dialog ≥ 640 px, bottom sheet below. Focus is trapped by Radix;
 * `blocking` dialogs ignore Esc and outside clicks (submit overlay, session-revoked modal).
 */
export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

const overlayClasses = 'fixed inset-0 z-overlay bg-overlay';

export function DialogContent({
  title,
  description,
  children,
  className,
  blocking = false,
  hideClose = false,
  ...props
}: ComponentProps<typeof D.Content> & {
  title: ReactNode;
  description?: ReactNode;
  blocking?: boolean;
  hideClose?: boolean;
}) {
  const t = useTranslations('common');
  const prevent = (event: Event) => event.preventDefault();
  return (
    <D.Portal>
      <D.Overlay className={overlayClasses} />
      <D.Content
        {...(blocking ? { onEscapeKeyDown: prevent, onPointerDownOutside: prevent, onInteractOutside: prevent } : {})}
        className={cn(
          'fixed inset-x-0 bottom-0 z-overlay max-h-dvh-90 overflow-y-auto rounded-t-xl bg-surface p-6 pb-safe shadow-lg focus:outline-none',
          'sm:inset-x-auto sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:w-full sm:max-w-form sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:pb-6',
          className,
        )}
        {...props}
      >
        <D.Title className="pr-10 text-lg font-semibold text-fg">{title}</D.Title>
        {description ? (
          <D.Description className="mt-2 text-base text-fg-muted">{description}</D.Description>
        ) : (
          <D.Description className="sr-only">{typeof title === 'string' ? title : ''}</D.Description>
        )}
        <div className="mt-4">{children}</div>
        {!blocking && !hideClose ? (
          <D.Close
            aria-label={t('close')}
            className="absolute top-4 right-4 flex size-11 items-center justify-center rounded-md text-fg-muted hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-focus-ring"
          >
            <X aria-hidden className="size-5" />
          </D.Close>
        ) : null}
      </D.Content>
    </D.Portal>
  );
}

/** Action row: stacked full-width on mobile (primary last), right-aligned on ≥ 640 px. */
/** On phones the actions stick to the bottom of the sheet, so the primary action is reachable in long forms. */
export function DialogActions({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'sticky bottom-0 -mx-6 mt-6 flex flex-col-reverse gap-3 border-t border-border bg-surface px-6 py-4',
        'sm:static sm:mx-0 sm:flex-row sm:justify-end sm:border-0 sm:bg-transparent sm:p-0',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Side drawer / bottom sheet (mobile menu, admin drawer, question navigator). */
export function SheetContent({
  side = 'right',
  title,
  children,
  className,
  ...props
}: ComponentProps<typeof D.Content> & { side?: 'left' | 'right' | 'bottom'; title: ReactNode }) {
  const t = useTranslations('common');
  return (
    <D.Portal>
      <D.Overlay className={overlayClasses} />
      <D.Content
        className={cn(
          'fixed z-overlay flex flex-col bg-surface shadow-lg focus:outline-none',
          side === 'bottom' && 'inset-x-0 bottom-0 max-h-dvh-75 rounded-t-xl pb-safe',
          side === 'right' && 'inset-y-0 right-0 w-80 max-w-full',
          side === 'left' && 'inset-y-0 left-0 w-80 max-w-full',
          className,
        )}
        {...props}
      >
        {side === 'bottom' ? <div aria-hidden className="mx-auto mt-2 h-1 w-9 rounded-full bg-border-strong" /> : null}
        <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2">
          <D.Title className="text-lg font-semibold text-fg">{title}</D.Title>
          <D.Description className="sr-only">{typeof title === 'string' ? title : ''}</D.Description>
          <D.Close
            aria-label={t('close')}
            className="flex size-11 items-center justify-center rounded-md text-fg-muted hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-focus-ring"
          >
            <X aria-hidden className="size-5" />
          </D.Close>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{children}</div>
      </D.Content>
    </D.Portal>
  );
}
