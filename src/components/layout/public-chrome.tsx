'use client';

import { Menu, MessageCircle } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from '@/lib/i18n/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogTrigger, SheetContent } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { LanguageToggle, ThemeToggle } from './toggles';

/** Paths where the sticky Enroll bar is hidden (docs/02_AppFlow.md §2). */
const NO_ENROLL_BAR = ['/enroll', '/sample', '/login'];
export const hidesEnrollBar = (pathname: string) =>
  NO_ENROLL_BAR.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

export function StickyEnrollBar() {
  const t = useTranslations('common');
  const pathname = usePathname();
  if (hidesEnrollBar(pathname)) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-sticky border-t border-border bg-surface px-4 pt-2 pb-safe shadow-md md:hidden">
      <div className="pb-2">
        <Button asChild size="lg" fullWidth>
          <Link href="/enroll">{t('enrollNow')}</Link>
        </Button>
      </div>
    </div>
  );
}

export function WhatsAppFab({ href }: { href: string | null }) {
  const t = useTranslations('common');
  const pathname = usePathname();
  // The sample flow has its own bottom CTA and FABs.
  if (!href || pathname.startsWith('/sample')) return null;
  const barVisible = !hidesEnrollBar(pathname);
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t('chatOnWhatsapp')}
      className={cn(
        'fixed right-4 z-fab flex size-14 items-center justify-center rounded-full bg-whatsapp text-on-whatsapp shadow-lg transition-transform duration-120 hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring md:right-6 md:bottom-6',
        barVisible ? 'bottom-24' : 'bottom-6',
      )}
    >
      <MessageCircle aria-hidden className="size-7" />
    </a>
  );
}

export function PublicMobileMenu() {
  const t = useTranslations();
  const links = [
    { href: '/', label: t('nav.home') },
    { href: '/routine', label: t('nav.routine') },
    { href: '/sample', label: t('nav.sample') },
    { href: '/faq', label: t('nav.faq') },
    { href: '/enroll', label: t('nav.enroll') },
  ];
  return (
    <Dialog>
      <DialogTrigger
        aria-label={t('common.openMenu')}
        className="inline-flex size-11 items-center justify-center rounded-md text-fg-muted hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-focus-ring md:hidden"
      >
        <Menu aria-hidden className="size-6" />
      </DialogTrigger>
      <SheetContent side="right" title={t('common.menu')}>
        <nav className="flex flex-col">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="flex min-h-12 items-center rounded-md px-3 text-base font-medium text-fg hover:bg-surface-2"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="mt-4 flex flex-col gap-1 border-t border-border pt-4">
          <LanguageToggle withLabel className="justify-start" />
          <ThemeToggle withLabel className="justify-start" />
        </div>
      </SheetContent>
    </Dialog>
  );
}

/** Desktop nav link with an active state. */
export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium transition-colors duration-120 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-focus-ring',
        active ? 'text-primary' : 'text-fg-muted',
      )}
    >
      {children}
    </Link>
  );
}
