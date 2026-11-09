import { FileQuestion } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ExamClient } from '@/components/exam/exam-client';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/misc';
import { getSamplePaper } from '@/features/sample/service';

/** /sample — the trial (sample) exam, no login (PRD V-05, docs/02_AppFlow.md §4.5). */
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('sample'))('title') };
}

export default async function SamplePage() {
  const [t, paper] = await Promise.all([getTranslations('sample'), getSamplePaper()]);
  if (!paper) {
    return (
      <main id="main" className="mx-auto max-w-form px-4 py-16">
        <EmptyState
          icon={<FileQuestion />}
          title={t('unavailable')}
          action={
            <Button asChild>
              <Link href="/#pricing">{t('enroll')}</Link>
            </Button>
          }
        />
      </main>
    );
  }
  return (
    <ExamClient
      mode="sample"
      title={paper.exam.title}
      questions={paper.questions}
      durationMinutes={paper.exam.durationMinutes}
      marksPerQuestion={paper.exam.marksPerQuestion}
      negativeMark={paper.exam.negativeMark}
      allowMarkForReview={paper.exam.allowMarkForReview}
    />
  );
}
