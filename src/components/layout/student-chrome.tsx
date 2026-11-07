'use client';

import { Bell, ClipboardList, House, LayoutDashboard, Trophy, UserRound } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

/** docs/02_AppFlow.md §2 (Student) and docs/03_UI_Spec.md §7.21. */
const TABS = [
  { href: '/dashboard', key: 'dashboard', Icon: LayoutDashboard },
  { href: '/exams', key: 'exams', Icon: ClipboardList },
  { href: '/results', key: 'results', Icon: Trophy },
  { href: '/profile', key: 'profile', Icon: UserRound },
] as const;

export const isTabActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

export function BottomNav() {
  const t = useTranslations('nav');
  const pathname = usePathname();
  return (
    <nav
      aria-label={t('main')}
      className="fixed inset-x-0 bottom-0 z-sticky border-t border-border bg-surface pb-safe md:hidden"
    >
      <ul className="grid h-16 grid-cols-4">
        {TABS.map(({ href, key, Icon }) => {
          const active = isTabActive(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex h-full flex-col items-center justify-center gap-0.5 text-xs font-medium focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring',
                  active ? 'text-primary' : 'text-fg-subtle',
                )}
              >
                {active ? <span aria-hidden className="absolute inset-x-6 top-0 h-0.75 rounded-b-full bg-primary" /> : null}
                <Icon aria-hidden className="size-6" />
                {t(key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Header icon row: Home, Notifications (R1: disabled "coming soon", hidden on mobile), Profile. */
export function StudentHeaderActions() {
  const t = useTranslations();
  const icon =
    'inline-flex size-11 items-center justify-center rounded-md text-fg-muted hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-focus-ring';
  return (
    <>
      <Link href="/dashboard" aria-label={t('nav.home')} className={icon}>
        <House aria-hidden className="size-5" />
      </Link>
      <button type="button" disabled title={t('common.comingSoon')} aria-label={`${t('nav.notifications')} (${t('common.comingSoon')})`} className={cn(icon, 'hidden opacity-50 md:inline-flex')}>
        <Bell aria-hidden className="size-5" />
      </button>
      <Link href="/profile" aria-label={t('nav.profile')} className={icon}>
        <UserRound aria-hidden className="size-5" />
      </Link>
    </>
  );
}

/** Desktop (≥ 768 px) tab row inside the header, since the bottom nav is mobile-only. */
export function StudentDesktopNav() {
  const t = useTranslations('nav');
  const pathname = usePathname();
  return (
    <nav aria-label={t('main')} className="hidden items-center gap-1 md:flex">
      {TABS.map(({ href, key }) => (
        <Link
          key={href}
          href={href}
          aria-current={isTabActive(pathname, href) ? 'page' : undefined}
          className={cn(
            'inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium hover:bg-surface-2',
            isTabActive(pathname, href) ? 'text-primary' : 'text-fg-muted',
          )}
        >
          {t(key)}
        </Link>
      ))}
    </nav>
  );
}
