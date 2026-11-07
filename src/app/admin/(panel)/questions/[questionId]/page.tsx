import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/admin/ui';
import { getQuestionForEdit } from '@/features/questions/queries';
import { questionUsage } from '@/features/questions/service';
import { getTaxonomy } from '@/features/taxonomy/queries';
import { type EditorInitial, QuestionEditor } from '../question-editor';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('admin.editor'))('editTitle') };
}

export default async function EditQuestionPage({ params }: { params: Promise<{ questionId: string }> }) {
  const { questionId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(questionId)) notFound();
  const [t, taxonomy, question, usage] = await Promise.all([
    getTranslations('admin.editor'),
    getTaxonomy(),
    getQuestionForEdit(questionId),
    questionUsage(questionId),
  ]);
  if (!question) notFound();
  return (
    <>
      <PageHeader title={t('editTitle')} />
      <QuestionEditor key={question.updated_at} taxonomy={taxonomy} initial={question as EditorInitial} usage={usage.examsWithAttempts} />
    </>
  );
}
