import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/admin/ui';
import { getTaxonomy } from '@/features/taxonomy/queries';
import { TaxonomyManager } from './taxonomy-manager';

/** /admin/taxonomy — subjects, chapters, topics (PRD A-06; tags removed in R1.1). */
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('admin.taxonomy'))('title') };
}

export default async function TaxonomyPage() {
  const [t, taxonomy] = await Promise.all([getTranslations('admin.taxonomy'), getTaxonomy()]);
  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      <TaxonomyManager taxonomy={taxonomy} />
    </>
  );
}
