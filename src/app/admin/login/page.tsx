import { ShieldCheck } from 'lucide-react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { LanguageToggle, ThemeToggle } from '@/components/layout/toggles';
import { Card } from '@/components/ui/card';
import { getAdminAuth } from '@/lib/auth/guards';
import { safeNextPath } from '@/lib/auth/next-path';
import { AdminLoginForm } from './admin-login-form';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('adminLogin'))('title'), robots: { index: false } };
}

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const [{ next }, auth] = await Promise.all([searchParams, getAdminAuth()]);
  const target = next ? safeNextPath(next, '/admin') : '/admin';
  if (auth.ok) redirect(target.startsWith('/admin') ? target : '/admin');
  const t = await getTranslations('adminLogin');
  return (
    <main id="main" className="flex min-h-dvh flex-col">
      <div className="flex justify-end p-2">
        <LanguageToggle />
        <ThemeToggle />
      </div>
      <div className="mx-auto w-full max-w-form flex-1 px-4 py-8">
        <span aria-hidden className="flex size-14 items-center justify-center rounded-full bg-primary-soft text-primary">
          <ShieldCheck className="size-7" />
        </span>
        <h1 className="mt-4 text-2xl font-bold text-fg">{t('title')}</h1>
        <p className="mt-1 mb-6 text-base text-fg-muted">{t('subtitle')}</p>
        <Card className="p-5 md:p-6">
          <AdminLoginForm next={target.startsWith('/admin') ? target : null} />
        </Card>
      </div>
    </main>
  );
}
