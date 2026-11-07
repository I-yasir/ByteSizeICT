'use client';

import { Languages, Monitor, Moon, Sun } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from '@/lib/i18n/client';
import { useTheme } from 'next-themes';
import { useSyncExternalStore, useTransition } from 'react';
import { setLocale } from '@/features/preferences/actions';
import { cn } from '@/lib/utils';

const noopSubscribe = () => () => {};

const iconButton =
  'inline-flex size-11 items-center justify-center rounded-md text-fg-muted transition-colors duration-120 hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-focus-ring';

/** System → Light → Dark (docs/03_UI_Spec.md §5 rule 2). */
export function ThemeToggle({ withLabel = false, className }: { withLabel?: boolean; className?: string }) {
  const t = useTranslations('theme');
  const { theme, setTheme } = useTheme();
  // true only after hydration, so the server and first client render agree on "system"
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);

  const current = mounted ? (theme ?? 'system') : 'system';
  const next = current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system';
  const Icon = current === 'light' ? Sun : current === 'dark' ? Moon : Monitor;
  const name = t(current as 'system' | 'light' | 'dark');
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`${t('label')}: ${name}`}
      className={cn(iconButton, withLabel && 'w-auto gap-2 px-3 text-sm font-medium', className)}
    >
      <Icon aria-hidden className="size-5" />
      {withLabel ? <span>{name}</span> : null}
    </button>
  );
}

/** বাংলা ⇄ English; persists the cookie and re-renders server components. */
export function LanguageToggle({ withLabel = false, className }: { withLabel?: boolean; className?: string }) {
  const t = useTranslations('language');
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const target = locale === 'bn' ? 'en' : 'bn';
  return (
    <button
      type="button"
      disabled={pending}
      lang={target}
      onClick={() =>
        startTransition(async () => {
          await setLocale(target);
          router.refresh();
        })
      }
      aria-label={t('switchTo', { language: t(target) })}
      className={cn(iconButton, 'w-auto gap-1.5 px-2.5 text-sm font-semibold', className)}
    >
      <Languages aria-hidden className="size-5" />
      <span>{withLabel ? t(target) : target === 'bn' ? 'বাং' : 'EN'}</span>
    </button>
  );
}
