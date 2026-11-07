import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { getActivePlans, getPaymentAccounts, getPublicSettings } from '@/features/public/queries';
import { getOptionalStudent } from '@/lib/auth/guards';
import { EnrollForm } from './enroll-form';

/** /enroll (docs/02_AppFlow.md §4.3): `?plan=<code>` preselects a plan; `?kind=renewal` from /renew. */
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('enroll'))('title') };
}

export default async function EnrollPage({ searchParams }: { searchParams: Promise<{ plan?: string; kind?: string }> }) {
  const [{ plan: planCode, kind }, t, plans, accounts, settings, student] = await Promise.all([
    searchParams,
    getTranslations('enroll'),
    getActivePlans(),
    getPaymentAccounts(),
    getPublicSettings(),
    getOptionalStudent(),
  ]);
  const initialPlan = plans.find((p) => p.code === planCode) ?? plans.find((p) => p.isHighlighted) ?? plans[0] ?? null;

  return (
    <div className="mx-auto max-w-marketing px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <h1 className="text-2xl font-bold text-fg lg:text-3xl">{t('title')}</h1>
      <p className="mt-1 mb-8 text-base text-fg-muted">{t('subtitle')}</p>
      <EnrollForm
        plans={plans}
        accounts={accounts}
        initialPlanId={initialPlan?.id ?? null}
        defaultMobile={student?.student.mobile ?? ''}
        isRenewal={kind === 'renewal' || Boolean(student)}
        whatsapp={settings.contact.whatsapp}
      />
    </div>
  );
}
