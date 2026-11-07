import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ExamClient } from '@/components/exam/exam-client';
import { getAttemptSession } from '@/features/attempts/service';
import { ServiceError } from '@/lib/actions';
import { requireActiveStudent } from '@/lib/auth/guards';

/** /attempts/[attemptId] — the single scrolling exam page (docs/02_AppFlow.md §5.4). */
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('examPage'))('pageTitle'), robots: { index: false } };
}

export default async function AttemptPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  const { student } = await requireActiveStudent({ currentPath: `/attempts/${attemptId}` });
  if (!/^[0-9a-f-]{36}$/i.test(attemptId)) notFound();

  let session;
  try {
    session = await getAttemptSession(attemptId, student.id);
  } catch (error) {
    if (error instanceof ServiceError && error.code === 'ATTEMPT_CLOSED') redirect(`/attempts/${attemptId}/result`);
    if (error instanceof ServiceError && error.code === 'NOT_FOUND') notFound();
    throw error;
  }

  return (
    <ExamClient
      mode="live"
      attemptId={session.attemptId}
      title={session.exam.title}
      questions={session.questions}
      durationMinutes={session.exam.durationMinutes}
      marksPerQuestion={session.exam.marksPerQuestion}
      negativeMark={session.exam.negativeMark}
      allowMarkForReview={session.exam.allowMarkForReview}
      deadlineAt={session.deadlineAt}
      serverNow={session.serverNow}
      savedAnswers={session.answers}
      lastQuestionIndex={session.lastQuestionIndex}
    />
  );
}
