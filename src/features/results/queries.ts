import 'server-only';
import { getSetting } from '@/features/settings/queries';
import { check, unwrap, unwrapMaybe } from '@/lib/actions';
import type { AccessState } from '@/lib/auth/access';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { OptionKey, OptionStats, ReviewQuestion } from '@/types/domain';
import { buildReview } from './review';

/** Result & review (docs/02_AppFlow.md §5.5, TRD §7.3). Gated fields are never computed when hidden. */
export type ResultPayload = {
  exam: { id: string; title: string; chapterLabel: string | null; totalMarks: number; questionCount: number; negativeMark: number };
  attempt: {
    id: string;
    score: number;
    correct: number;
    incorrect: number;
    skipped: number;
    /** correct / (correct + incorrect) × 100, null when nothing was answered */
    accuracy: number | null;
    isLate: boolean;
    submittedAt: string;
    status: 'submitted' | 'auto_submitted';
  };
  rank:
    | { visible: true; position: number | null; participants: number; highest: number | null; unrankedLate: boolean }
    | { visible: false; publishAt: string | null };
  answersVisible: boolean;
  answersPublishAt: string | null;
  statsVisible: boolean;
  questions: ReviewQuestion[];
};

export type AttemptResult =
  | { kind: 'result'; result: ResultPayload }
  | { kind: 'in_progress'; attemptId: string }
  | { kind: 'hidden' } // inactive student with results.visibleWhenInactive = false
  | { kind: 'not_found' };

const pct = (count: number, total: number) => (total === 0 ? 0 : Math.round((count / total) * 1000) / 10);

export async function examOptionStats(examId: string): Promise<Map<string, OptionStats>> {
  const rows = unwrap(await supabaseAdmin.rpc('exam_question_stats', { p_exam_id: examId }));
  return new Map(
    rows.map((r) => [
      r.question_id,
      { A: pct(r.a, r.total), B: pct(r.b, r.total), C: pct(r.c, r.total), D: pct(r.d, r.total), skipped: pct(r.skipped, r.total) },
    ]),
  );
}

export async function getAttemptResult(
  attemptId: string,
  student: { id: string; accessState: AccessState },
  now = new Date(),
): Promise<AttemptResult> {
  if (student.accessState !== 'active' && !(await getSetting('results')).visibleWhenInactive) return { kind: 'hidden' };

  check(await supabaseAdmin.rpc('finalize_attempt_if_overdue', { p_attempt_id: attemptId }));
  const attempt = unwrapMaybe(
    await supabaseAdmin
      .from('exam_attempts')
      .select('id, student_id, status, score, correct_count, incorrect_count, skipped_count, is_late, submitted_at, question_order, option_order, exam:exams(id, title, chapter_label, question_count, marks_per_question, negative_mark, results_publish_at, answers_publish_at, show_option_stats, rank_late_attempts)')
      .eq('id', attemptId)
      .maybeSingle(),
  );
  if (!attempt || attempt.student_id !== student.id || !attempt.exam) return { kind: 'not_found' };
  if (attempt.status === 'in_progress' || !attempt.submitted_at) return { kind: 'in_progress', attemptId };

  const exam = attempt.exam;
  const submittedAt = attempt.submitted_at;
  const visibleAt = (publishAt: string | null) => now.getTime() >= Date.parse(publishAt ?? submittedAt);
  const rankVisible = visibleAt(exam.results_publish_at);
  const answersVisible = visibleAt(exam.answers_publish_at);
  const statsVisible = answersVisible && exam.show_option_stats;

  const [rankRows, stats, selections] = await Promise.all([
    rankVisible ? supabaseAdmin.rpc('attempt_rank', { p_attempt_id: attemptId }).then(unwrap) : Promise.resolve(null),
    statsVisible ? examOptionStats(exam.id) : Promise.resolve(null),
    supabaseAdmin
      .from('attempt_answers')
      .select('question_id, selected_option, is_marked')
      .eq('attempt_id', attemptId)
      .then(unwrap),
  ]);

  const questions = await buildReview({
    questionIds: attempt.question_order,
    optionOrder: attempt.option_order as Record<string, string>,
    selections: new Map(selections.map((s) => [s.question_id, { selected: s.selected_option as OptionKey | null, marked: s.is_marked }])),
    answersVisible,
    stats,
  });

  const correct = attempt.correct_count ?? 0;
  const incorrect = attempt.incorrect_count ?? 0;
  const rankRow = rankRows?.[0];
  return {
    kind: 'result',
    result: {
      exam: {
        id: exam.id,
        title: exam.title,
        chapterLabel: exam.chapter_label,
        totalMarks: attempt.question_order.length * Number(exam.marks_per_question),
        questionCount: attempt.question_order.length,
        negativeMark: Number(exam.negative_mark),
      },
      attempt: {
        id: attempt.id,
        score: Number(attempt.score),
        correct,
        incorrect,
        skipped: attempt.skipped_count ?? 0,
        accuracy: correct + incorrect === 0 ? null : Math.round((correct / (correct + incorrect)) * 1000) / 10,
        isLate: attempt.is_late,
        submittedAt,
        status: attempt.status,
      },
      rank: rankVisible
        ? {
            visible: true,
            position: rankRow?.rank_position ?? null,
            participants: rankRow?.participants ?? 0,
            highest: rankRow?.highest === null || rankRow?.highest === undefined ? null : Number(rankRow.highest),
            unrankedLate: attempt.is_late && !exam.rank_late_attempts,
          }
        : { visible: false, publishAt: exam.results_publish_at },
      answersVisible,
      answersPublishAt: exam.answers_publish_at,
      statsVisible,
      questions,
    },
  };
}

/** /results (S-12): final attempts, newest first. */
export async function listStudentResults(studentId: string, options: { page?: number; pageSize?: number } = {}) {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, options.pageSize ?? 20));
  const { data, count, error } = await supabaseAdmin
    .from('exam_attempts')
    .select('id, score, is_late, submitted_at, status, question_order, exam:exams(id, title, chapter_label, marks_per_question)', { count: 'exact' })
    .eq('student_id', studentId)
    .neq('status', 'in_progress')
    .order('submitted_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  const rows = unwrap({ data, error });
  return {
    items: rows.map((row) => {
      const total = row.question_order.length * Number(row.exam?.marks_per_question ?? 0);
      return {
        attemptId: row.id,
        examTitle: row.exam?.title ?? '',
        chapterLabel: row.exam?.chapter_label ?? null,
        score: Number(row.score),
        total,
        percent: total > 0 ? Math.round((Number(row.score) / total) * 1000) / 10 : 0,
        isLate: row.is_late,
        submittedAt: row.submitted_at as string,
      };
    }),
    total: count ?? 0,
    page,
    pageSize,
  };
}
