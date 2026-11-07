import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ExamClient } from '@/components/exam/exam-client';
import { getExamPreview } from '@/features/exams/queries';
import type { OptionKey } from '@/types/domain';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('admin.builder'))('preview') };
}

/** /admin/exams/[examId]/preview — the student exam page in preview mode (docs/02_AppFlow.md §6.9). */
export default async function ExamPreviewPage({ params }: { params: Promise<{ examId: string }> }) {
  const { examId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(examId)) notFound();
  const preview = await getExamPreview(examId);
  if (!preview) notFound();
  const answerKey: Record<string, OptionKey> = Object.fromEntries(preview.questions.map((q) => [q.id, q.correctOption]));
  return (
    <div className="-m-4 sm:-m-6 lg:-m-8">
      <ExamClient
        mode="preview"
        title={preview.exam.title}
        questions={preview.questions.map(({ id, n, stemHtml, stemImageUrl, options }) => ({ id, n, stemHtml, stemImageUrl, options }))}
        durationMinutes={preview.exam.duration_minutes}
        marksPerQuestion={Number(preview.exam.marks_per_question)}
        negativeMark={Number(preview.exam.negative_mark)}
        allowMarkForReview={preview.exam.allow_mark_for_review}
        answerKey={answerKey}
      />
    </div>
  );
}
