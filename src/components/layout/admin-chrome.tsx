'use client';

import { FileText, FolderTree, Inbox, LayoutDashboard, Library, LogOut, Menu, ScrollText, Settings, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from '@/lib/i18n/client';
import { useTransition } from 'react';
import { adminLogout } from '@/features/auth/actions';
import { Dialog, DialogTrigger, SheetContent } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

/** docs/02_AppFlow.md §2 (Admin): sidebar ≥ 1024 px, drawer below. */
const ITEMS = [
  { href: '/admin', key: 'overview', Icon: LayoutDashboard, exact: true },
  { href: '/admin/admissions', key: 'admissions', Icon: Inbox },
  { href: '/admin/students', key: 'students', Icon: Users },
  { href: '/admin/questions', key: 'questions', Icon: Library },
  { href: '/admin/taxonomy', key: 'taxonomy', Icon: FolderTree },
  { href: '/admin/exams', key: 'exams', Icon: FileText },
  { href: '/admin/settings', key: 'settings', Icon: Settings },
  { href: '/admin/audit', key: 'audit', Icon: ScrollText },
] as const;

function AdminNavList({ pendingAdmissions }: { pendingAdmissions: number }) {
  const t = useTranslations('adminNav');
  const pathname = usePathname();
  return (
    <ul className="flex flex-col gap-1">
      {ITEMS.map(({ href, key, Icon, ...rest }) => {
        const active = 'exact' in rest ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <li key={href}>
            <Link
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors duration-120 focus-visible:outline-2 focus-visible:outline-focus-ring',
                active ? 'bg-primary-soft text-primary' : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
              )}
            >
              <Icon aria-hidden className="size-5" />
              <span className="flex-1">{t(key)}</span>
              {key === 'admissions' && pendingAdmissions > 0 ? (
                <span className="min-w-6 rounded-full bg-danger px-1.5 text-center font-num text-xs leading-5 font-semibold text-fg-inverse">
                  {pendingAdmissions}
                </span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function AdminSidebar({ pendingAdmissions }: { pendingAdmissions: number }) {
  const t = useTranslations('adminNav');
  return (
    <aside className="hidden w-sidebar shrink-0 border-r border-border bg-surface lg:block">
      <nav aria-label={t('label')} className="sticky top-15 p-4">
        <AdminNavList pendingAdmissions={pendingAdmissions} />
      </nav>
    </aside>
  );
}

export function AdminMobileNav({ pendingAdmissions }: { pendingAdmissions: number }) {
  const t = useTranslations();
  return (
    <Dialog>
      <DialogTrigger
        aria-label={t('common.openMenu')}
        className="inline-flex size-11 items-center justify-center rounded-md text-fg-muted hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-focus-ring lg:hidden"
      >
        <Menu aria-hidden className="size-6" />
      </DialogTrigger>
      <SheetContent side="left" title={t('adminNav.label')}>
        <AdminNavList pendingAdmissions={pendingAdmissions} />
      </SheetContent>
    </Dialog>
  );
}

export function AdminLogoutButton() {
  const t = useTranslations('adminNav');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await adminLogout();
          router.replace(result.ok ? result.data.redirectTo : '/admin/login');
        })
      }
      className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium text-fg-muted hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-focus-ring"
    >
      <LogOut aria-hidden className="size-4" />
      <span className="hidden sm:inline">{t('logout')}</span>
    </button>
  );
}
