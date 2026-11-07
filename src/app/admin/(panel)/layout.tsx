import type { ReactNode } from 'react';
import { AdminLogoutButton, AdminMobileNav, AdminSidebar } from '@/components/layout/admin-chrome';
import { Brand } from '@/components/layout/brand';
import { LanguageToggle, ThemeToggle } from '@/components/layout/toggles';
import { countPendingAdmissions } from '@/features/admissions/queries';
import { getSetting } from '@/features/settings/queries';
import { requireAdmin } from '@/lib/auth/guards';
import { Toaster } from '@/components/ui/toast';

/** Admin chrome (docs/02_AppFlow.md §2): top bar + sidebar (≥ 1024 px) / drawer. */
export default async function AdminPanelLayout({ children }: { children: ReactNode }) {
  const { admin } = await requireAdmin();
  const [brand, pending] = await Promise.all([getSetting('brand'), countPendingAdmissions()]);
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-sticky h-15 border-b border-border bg-surface">
        <div className="flex h-full items-center justify-between gap-2 px-4">
          <div className="flex items-center gap-1">
            <AdminMobileNav pendingAdmissions={pending} />
            <Brand name={brand.name} href="/admin" />
          </div>
          <div className="flex items-center gap-1">
            <span className="hidden text-sm text-fg-muted md:inline">{admin.email}</span>
            <LanguageToggle />
            <ThemeToggle />
            <AdminLogoutButton />
          </div>
        </div>
      </header>
      <div className="flex flex-1">
        <AdminSidebar pendingAdmissions={pending} />
        <main id="main" className="mx-auto w-full max-w-admin min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
      <Toaster />
    </div>
  );
}
