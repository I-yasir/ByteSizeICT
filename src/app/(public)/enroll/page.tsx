import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { PlanCard } from '@/components/marketing/plan-card';
import { getActivePlans, getPaymentAccounts, getPublicSettings } from '@/features/public/queries';
import { getOptionalStudent } from '@/lib/auth/guards';
import { EnrollForm } from './enroll-form';

/**
 * /enroll (docs/02_AppFlow.md §4.3, CR9): exactly one plan, `?plan=<code>` (from a plan card or /renew);
 * missing, unknown or inactive → the homepage plans. `?kind=renewal` comes from /renew.
 */
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
  const plan = planCode ? plans.find((p) => p.code === planCode) : undefined;
  if (!plan) redirect('/#pricing');

  return (
    <div className="mx-auto max-w-marketing px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <h1 className="text-2xl font-bold text-fg lg:text-3xl">{t('title')}</h1>
      <p className="mt-1 mb-8 text-base text-fg-muted">{t('subtitle')}</p>
      <EnrollForm
        plan={plan}
        planSummary={<PlanCard plan={plan} showChoose={false} />}
        accounts={accounts}
        defaultMobile={student?.student.mobile ?? ''}
        isRenewal={kind === 'renewal' || Boolean(student)}
        whatsapp={settings.contact.whatsapp}
      />
    </div>
  );
}
