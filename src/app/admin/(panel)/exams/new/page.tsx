import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/admin/ui';
import { getTaxonomy } from '@/features/taxonomy/queries';
import { ExamSettingsForm } from '../exam-settings-form';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('admin.exams'))('new') };
}

export default async function NewExamPage() {
  const [t, taxonomy] = await Promise.all([getTranslations('admin.exams'), getTaxonomy()]);
  return (
    <>
      <PageHeader title={t('new')} />
      <ExamSettingsForm exam={null} subjects={taxonomy.subjects.map((s) => ({ id: s.id, name_en: s.name_en }))} />
    </>
  );
}
