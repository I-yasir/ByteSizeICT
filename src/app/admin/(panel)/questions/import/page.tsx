import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/admin/ui';
import { ImportWizard } from './import-wizard';

/** /admin/questions/import (PRD A-08, docs/02_AppFlow.md §6.7). */
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('admin.import'))('title') };
}

export default async function ImportPage() {
  const t = await getTranslations('admin.import');
  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      <ImportWizard />
    </>
  );
}
