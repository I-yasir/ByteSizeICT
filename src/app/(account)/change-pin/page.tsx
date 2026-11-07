import { ShieldCheck } from 'lucide-react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui/card';
import { requireStudent } from '@/lib/auth/guards';
import { ChangePinForm } from './change-pin-form';

/** /change-pin — only while `must_change_pin` (docs/02_AppFlow.md §1.2). */
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('changePin'))('title') };
}

export default async function ChangePinPage() {
  const { student, accessState } = await requireStudent({ allowMustChangePin: true, currentPath: '/change-pin' });
  if (!student.must_change_pin) redirect(accessState === 'active' ? '/dashboard' : '/renew');
  const t = await getTranslations('changePin');
  return (
    <div className="mx-auto max-w-form px-4 py-10 lg:py-16">
      <span aria-hidden className="flex size-14 items-center justify-center rounded-full bg-primary-soft text-primary">
        <ShieldCheck className="size-7" />
      </span>
      <h1 className="mt-4 text-2xl font-bold text-fg">{t('title')}</h1>
      <p className="mt-1 mb-6 text-base text-fg-muted">{t('subtitle')}</p>
      <Card className="p-5 md:p-6">
        <ChangePinForm />
      </Card>
    </div>
  );
}
