'use client';

import { X } from 'lucide-react';
import { type ReactNode, useEffect, useId, useRef } from 'react';
import { useTranslations } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

/**
 * Radix-free dialog for the exam route (P4.20: the Radix Dialog stack is ~11 KB gzipped).
 * `showModal()` puts it in the top layer: the page behind is inert, focus moves inside and
 * returns to the opener on close, and Esc fires `cancel`. Same look as ui/dialog.tsx (UI Spec
 * §7.11): bottom sheet below 640 px, centred dialog above; `side` turns it into a navigator sheet.
 * `blocking` ignores Esc and backdrop clicks (session-revoked / access-stopped modal).
 */
type Props = {
  open: boolean;
  onClose?: () => void;
  title: ReactNode;
  description?: ReactNode;
  blocking?: boolean;
  side?: 'center' | 'bottom' | 'right';
  className?: string;
  children: ReactNode;
};

const SHAPE = {
  center:
    'mt-auto mb-0 w-full max-w-full max-h-dvh-90 overflow-y-auto rounded-t-xl sm:m-auto sm:max-w-form sm:rounded-xl',
  bottom: 'mt-auto mb-0 w-full max-w-full max-h-dvh-75 rounded-t-xl pb-safe',
  right: 'my-0 mr-0 ml-auto h-dvh max-h-dvh w-80 max-w-full',
} as const;

export function NativeDialog({
  open,
  onClose,
  title,
  description,
  blocking = false,
  side = 'center',
  className,
  children,
}: Props) {
  const t = useTranslations('common');
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  // showModal() doesn't stop the page behind from scrolling.
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = 'hidden';
    return () => {
      root.style.overflow = previous;
    };
  }, [open]);

  const sheet = side !== 'center';
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault(); // React state decides when it closes
        if (!blocking) onClose?.();
      }}
      onClick={(event) => {
        // A click on the <dialog> element itself (not its content) is a backdrop click.
        if (!blocking && event.target === event.currentTarget) onClose?.();
      }}
      // `open:` variants only: a display class on a closed <dialog> would make it visible.
      className={cn(
        'border-0 bg-surface p-0 text-fg shadow-lg backdrop:bg-overlay',
        sheet && 'open:flex open:flex-col',
        SHAPE[side],
        className,
      )}
    >
      {open ? (
        // Padding lives here, not on <dialog>, so only true backdrop clicks hit the element itself.
        <div className={cn(sheet ? 'flex min-h-0 flex-1 flex-col' : 'p-6 pb-safe sm:pb-6')}>
          {side === 'bottom' ? (
            <div aria-hidden className="mx-auto mt-2 h-1 w-9 rounded-full bg-border-strong" />
          ) : null}
          <div className={cn('flex items-start justify-between gap-2', sheet && 'px-4 pt-3 pb-2')}>
            <h2 id={titleId} className="text-lg font-semibold text-fg">
              {title}
            </h2>
            {!blocking && onClose ? (
              <button
                type="button"
                onClick={onClose}
                aria-label={t('close')}
                className={cn(
                  'flex size-11 shrink-0 items-center justify-center rounded-md text-fg-muted hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-focus-ring',
                  !sheet && '-mt-2 -mr-2',
                )}
              >
                <X aria-hidden className="size-5" />
              </button>
            ) : null}
          </div>
          {description ? (
            <p id={descriptionId} className="mt-2 text-base text-fg-muted">
              {description}
            </p>
          ) : null}
          <div className={cn(sheet ? 'min-h-0 flex-1 overflow-y-auto px-4 pb-4' : 'mt-4')}>
            {children}
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
