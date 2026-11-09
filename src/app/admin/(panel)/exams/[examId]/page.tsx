import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/admin/ui';
import { getExamForBuilder } from '@/features/exams/queries';
import { listStudentLabels } from '@/features/students/queries';
import { getTaxonomy } from '@/features/taxonomy/queries';
import { ExamBuilder } from './builder';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('admin.exams'))('builder') };
}

export default async function ExamBuilderPage({ params }: { params: Promise<{ examId: string }> }) {
  const { examId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(examId)) notFound();
  const [t, data, taxonomy, labels] = await Promise.all([getTranslations('admin.exams'), getExamForBuilder(examId), getTaxonomy(), listStudentLabels()]);
  if (!data) notFound();
  const { exam } = data;
  return (
    <>
      <Link href="/admin/exams" className="text-sm font-semibold text-primary">← {t('title')}</Link>
      <PageHeader title={exam.title} />
      <ExamBuilder
        exam={{ ...exam, marks_per_question: Number(exam.marks_per_question), negative_mark: Number(exam.negative_mark) }}
        locked={data.locked}
        attemptCount={data.attemptCount}
        startPassed={exam.starts_at ? Date.parse(exam.starts_at) <= new Date().getTime() : false}
        questions={data.questions.map((q) => ({ id: q.id, stemHtml: q.stemHtml, status: q.status, chapterLabel: q.chapter ? `${q.chapter.number}. ${q.chapter.name_en}` : '' }))}
        assignees={data.assignees}
        chapters={taxonomy.subjects.flatMap((s) => s.chapters.map((c) => ({ id: c.id, label: `${s.name_en} · ${c.number}. ${c.name_en}` })))}
        subjects={taxonomy.subjects.map((s) => ({ id: s.id, name_en: s.name_en }))}
        labels={labels}
      />
    </>
  );
}
