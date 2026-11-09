import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/admin/ui';
import { getAllSettings, getIntegrationsStatus, listPaymentAccountsAdmin, listPlansAdmin } from '@/features/settings/queries';
import { planRoutineUrls, publicAssetUrl } from '@/lib/supabase/storage';
import { SettingsTabs } from './settings-tabs';

/** /admin/settings (PRD A-14/A-15, docs/02_AppFlow.md §6.11). */
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('admin.settings'))('title') };
}

export default async function SettingsPage() {
  const [t, settings, plans, accounts, integrations] = await Promise.all([
    getTranslations('admin.settings'),
    getAllSettings(),
    listPlansAdmin(),
    listPaymentAccountsAdmin(),
    getIntegrationsStatus(),
  ]);
  return (
    <>
      <PageHeader title={t('title')} />
      <SettingsTabs settings={settings} plans={plans.map((p) => ({ ...p, routineUrl: planRoutineUrls(p.routine_pdf_path)?.view ?? null }))} accounts={accounts} integrations={integrations} logoUrl={publicAssetUrl(settings.brand.logoPath)} />
    </>
  );
}
