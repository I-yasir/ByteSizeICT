import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui/card';
import { getPublicSettings } from '@/features/public/queries';
import { getOptionalStudent } from '@/lib/auth/guards';
import { safeNextPath } from '@/lib/auth/next-path';
import { LoginForm } from './login-form';

/** /login — already-signed-in students are sent on (docs/02_AppFlow.md §1.4). */
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('login'))('title') };
}

const REASONS: Record<string, 'new_login' | 'admin' | 'pin_changed' | 'expired'> = {
  new_login: 'new_login',
  admin_force_logout: 'admin',
  admin_cancel: 'admin',
  admin_suspend: 'admin',
  pin_changed: 'pin_changed',
  admin_pin_reset: 'pin_changed',
  expired: 'expired',
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reason?: string; next?: string }> }) {
  const [{ reason, next }, student] = await Promise.all([searchParams, getOptionalStudent()]);
  if (student) {
    if (student.student.must_change_pin) redirect('/change-pin');
    redirect(student.accessState === 'active' ? safeNextPath(next, '/dashboard') : '/renew');
  }
  const [t, settings] = await Promise.all([getTranslations('login'), getPublicSettings()]);
  return (
    <div className="mx-auto max-w-form px-4 py-10 lg:py-16">
      <h1 className="text-2xl font-bold text-fg">{t('title')}</h1>
      <p className="mt-1 mb-6 text-base text-fg-muted">{t('subtitle')}</p>
      <Card className="p-5 md:p-6">
        <LoginForm
          reason={(reason && REASONS[reason]) || null}
          next={next ? safeNextPath(next, '') || null : null}
          whatsapp={settings.contact.whatsapp}
          serverNow={new Date().toISOString()}
        />
      </Card>
    </div>
  );
}
