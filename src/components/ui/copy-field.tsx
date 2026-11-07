'use client';

import { Check, Copy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { notify } from './toast';

/** docs/03_UI_Spec.md §7.3 — monospaced value + Copy; selects the text when the Clipboard API is unavailable. */
export function CopyField({ value, label, className }: { value: string; label?: string; className?: string }) {
  const t = useTranslations('common');
  const [copied, setCopied] = useState(false);
  const valueRef = useRef<HTMLSpanElement>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      notify.success(t('numberCopied'));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const node = valueRef.current;
      if (node) window.getSelection()?.selectAllChildren(node);
      notify.info(t('pressToCopy'));
    }
  }

  return (
    <div className={cn('flex items-center justify-between gap-3 rounded-md bg-surface-2 py-1 pr-1 pl-4', className)}>
      <span ref={valueRef} className="font-num text-lg font-semibold tracking-wide text-fg tabular-nums">
        {value}
      </span>
      <button
        type="button"
        onClick={copy}
        aria-label={label ? `${t('copy')} ${label}` : t('copy')}
        className="inline-flex h-10 items-center gap-1.5 rounded-md px-3 text-sm font-semibold text-primary transition-colors duration-120 hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-focus-ring"
      >
        {copied ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
        {copied ? t('copied') : t('copy')}
      </button>
    </div>
  );
}
