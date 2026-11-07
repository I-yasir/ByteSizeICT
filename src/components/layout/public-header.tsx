import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Brand } from './brand';
import { NavLink, PublicMobileMenu } from './public-chrome';
import { LanguageToggle, ThemeToggle } from './toggles';

/** docs/02_AppFlow.md §2 (Public) — logo left; Routine, FAQ, Login, language, theme right. */
export async function PublicHeader({ brandName, logoUrl }: { brandName: string; logoUrl: string | null }) {
  const t = await getTranslations();
  return (
    <header className="sticky top-0 z-sticky h-15 border-b border-border bg-surface/95 backdrop-blur-sm">
      <div className="mx-auto flex h-full max-w-marketing items-center justify-between gap-2 px-4 sm:px-6 lg:px-8">
        <Brand name={brandName} logoUrl={logoUrl} href="/" />
        <nav aria-label={t('nav.main')} className="hidden items-center gap-1 md:flex">
          <NavLink href="/routine">{t('nav.routine')}</NavLink>
          <NavLink href="/sample">{t('nav.sample')}</NavLink>
          <NavLink href="/faq">{t('nav.faq')}</NavLink>
        </nav>
        <div className="flex items-center gap-1">
          <div className="hidden items-center md:flex">
            <LanguageToggle />
            <ThemeToggle />
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link href="/login">{t('common.login')}</Link>
          </Button>
          <Button asChild size="sm" className="hidden md:inline-flex">
            <Link href="/enroll">{t('common.enrollNow')}</Link>
          </Button>
          <PublicMobileMenu />
        </div>
      </div>
    </header>
  );
}
