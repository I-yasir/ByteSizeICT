import 'server-only';
import { check, ServiceError, unwrap, unwrapMaybe } from '@/lib/actions';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { AnswerChange, AttemptSession, OptionKey, SavedAnswer } from '@/types/domain';
import { buildPaper } from './paper';

/**
 * Exam runtime (TRD §8). Time, ownership and scoring are enforced by the SQL functions; this layer
 * maps them to the API contract and assembles the answer-free paper.
 */
export const resultUrl = (attemptId: string) => `/attempts/${attemptId}/result`;

function closed(attemptId: string): never {
  throw new ServiceError('ATTEMPT_CLOSED', { meta: { resultUrl: resultUrl(attemptId) } });
}

export async function startAttempt(examId: string, studentId: string): Promise<{ attemptId: string }> {
  const attemptId = unwrap(await supabaseAdmin.rpc('start_attempt', { p_exam_id: examId, p_student_id: studentId }));
  return { attemptId };
}

export async function getAttemptSession(attemptId: string, studentId: string): Promise<AttemptSession> {
  check(await supabaseAdmin.rpc('finalize_attempt_if_overdue', { p_attempt_id: attemptId }));
  const attempt = unwrapMaybe(
    await supabaseAdmin
      .from('exam_attempts')
      .select('id, status, student_id, deadline_at, question_order, option_order, last_question_index, exam:exams(id, title, duration_minutes, marks_per_question, negative_mark, allow_mark_for_review, question_count)')
      .eq('id', attemptId)
      .maybeSingle(),
  );
  if (!attempt || attempt.student_id !== studentId || !attempt.exam) throw new ServiceError('NOT_FOUND');
  if (attempt.status !== 'in_progress') closed(attemptId);

  const deadline = Date.parse(attempt.deadline_at);
  const [questions, saved] = await Promise.all([
    buildPaper({
      questionIds: attempt.question_order,
      optionOrder: attempt.option_order as Record<string, string>,
      imageTtlSeconds: (deadline - Date.now()) / 1000 + 600,
    }),
    supabaseAdmin
      .from('attempt_answers')
      .select('question_id, selected_option, is_marked, client_seq')
      .eq('attempt_id', attemptId)
      .then(unwrap),
  ]);

  const answers: Record<string, SavedAnswer> = {};
  for (const row of saved) {
    answers[row.question_id] = { o: row.selected_option as OptionKey | null, m: row.is_marked, s: Number(row.client_seq) };
  }
  const exam = attempt.exam;
  return {
    attemptId,
    status: 'in_progress',
    exam: {
      id: exam.id,
      title: exam.title,
      durationMinutes: exam.duration_minutes,
      marksPerQuestion: Number(exam.marks_per_question),
      negativeMark: Number(exam.negative_mark),
      allowMarkForReview: exam.allow_mark_for_review,
      questionCount: questions.length,
      totalMarks: questions.length * Number(exam.marks_per_question),
    },
    deadlineAt: attempt.deadline_at,
    serverNow: new Date().toISOString(),
    lastQuestionIndex: attempt.last_question_index,
    questions,
    answers,
  };
}

export async function saveAnswers(
  attemptId: string,
  studentId: string,
  changes: AnswerChange[],
  lastQuestionIndex?: number,
): Promise<{ applied: number; serverNow: string }> {
  const { data, error } = await supabaseAdmin.rpc('save_answers', {
    p_attempt_id: attemptId,
    p_student_id: studentId,
    p_changes: changes,
    ...(lastQuestionIndex !== undefined ? { p_last_index: lastQuestionIndex } : {}),
  });
  if (error?.message === 'ATTEMPT_CLOSED') closed(attemptId);
  check({ error });
  return { applied: data ?? 0, serverNow: new Date().toISOString() };
}

export async function submitAttempt(
  attemptId: string,
  studentId: string,
  changes: AnswerChange[],
  auto: boolean,
): Promise<{ resultUrl: string }> {
  const { error } = await supabaseAdmin.rpc('submit_attempt', {
    p_attempt_id: attemptId,
    p_student_id: studentId,
    p_changes: changes,
    p_auto: auto,
  });
  if (error?.message === 'ATTEMPT_CLOSED') closed(attemptId);
  check({ error });
  return { resultUrl: resultUrl(attemptId) };
}
