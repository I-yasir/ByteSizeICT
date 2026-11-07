import type { ReactNode } from 'react';
import { Brand } from '@/components/layout/brand';
import { LanguageToggle, ThemeToggle } from '@/components/layout/toggles';
import { getSetting } from '@/features/settings/queries';
import { Toaster } from '@/components/ui/toast';

/** Minimal chrome for account steps that must not show the app navigation (forced PIN change). */
export default async function AccountLayout({ children }: { children: ReactNode }) {
  const brand = await getSetting('brand');
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="h-15 border-b border-border bg-surface">
        <div className="mx-auto flex h-full max-w-app items-center justify-between px-4 sm:px-6">
          <Brand name={brand.name} href="/" />
          <div className="flex items-center">
            <LanguageToggle />
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main id="main" className="flex-1">
        {children}
      </main>
      <Toaster />
    </div>
  );
}
