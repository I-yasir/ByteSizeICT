import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/admin/ui';
import { getTaxonomy } from '@/features/taxonomy/queries';
import { QuestionEditor } from '../question-editor';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('admin.editor'))('newTitle') };
}

export default async function NewQuestionPage() {
  const [t, taxonomy] = await Promise.all([getTranslations('admin.editor'), getTaxonomy()]);
  return (
    <>
      <PageHeader title={t('newTitle')} />
      <QuestionEditor taxonomy={taxonomy} initial={null} usage={0} />
    </>
  );
}
