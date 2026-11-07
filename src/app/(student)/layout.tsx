import type { ReactNode } from 'react';
import { Brand } from '@/components/layout/brand';
import { BottomNav, StudentDesktopNav, StudentHeaderActions } from '@/components/layout/student-chrome';
import { getSetting } from '@/features/settings/queries';
import { requireStudent } from '@/lib/auth/guards';
import { Toaster } from '@/components/ui/toast';

/** Student chrome (docs/02_AppFlow.md §2). The exam page (P3.12) renders its own bars instead. */
export default async function StudentLayout({ children }: { children: ReactNode }) {
  await requireStudent();
  const brand = await getSetting('brand');
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-sticky h-15 border-b border-border bg-surface/95 backdrop-blur-sm">
        <div className="mx-auto flex h-full max-w-app items-center justify-between gap-2 px-4 sm:px-6">
          <Brand name={brand.name} href="/dashboard" />
          <StudentDesktopNav />
          <div className="flex items-center">
            <StudentHeaderActions />
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-app flex-1 px-4 pt-4 pb-24 sm:px-6 md:pb-10">
        {children}
      </main>
      <BottomNav />
      <Toaster />
    </div>
  );
}
