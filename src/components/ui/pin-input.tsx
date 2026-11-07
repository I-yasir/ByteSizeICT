'use client';

import { Eye, EyeOff } from 'lucide-react';
import { useTranslations } from '@/lib/i18n/client';
import { type InputHTMLAttributes, useState } from 'react';
import { cn } from '@/lib/utils';
import { controlClasses } from './field';

/** docs/03_UI_Spec.md §7.2 — numeric PIN with a show/hide toggle (44 px hit area). */
export function PinInput({
  className,
  autoComplete = 'current-password',
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const t = useTranslations('common');
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        type={visible ? 'text' : 'password'}
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={6}
        autoComplete={autoComplete}
        className={cn(controlClasses, 'h-12 pr-14 font-num tracking-widest', className)}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? t('hidePin') : t('showPin')}
        aria-pressed={visible}
        className="absolute inset-y-0 right-1 my-auto flex size-11 items-center justify-center rounded-md text-fg-muted hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-focus-ring"
      >
        {visible ? <EyeOff aria-hidden className="size-5" /> : <Eye aria-hidden className="size-5" />}
      </button>
    </div>
  );
}
