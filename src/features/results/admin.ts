import 'server-only';
import { unwrap, unwrapMaybe } from '@/lib/actions';
import { renderRichText } from '@/lib/content/render';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { formatDhaka } from '@/lib/time';

/** Admin exam results (docs/02_AppFlow.md §6.10, PRD A-12). */
export async function getExamResultsAdmin(examId: string) {
  const exam = unwrapMaybe(
    await supabaseAdmin
      .from('exams')
      .select('id, title, question_count, marks_per_question, rank_late_attempts')
      .eq('id', examId)
      .maybeSingle(),
  );
  if (!exam) return null;

  const [summaryRows, attempts, stats, questions] = await Promise.all([
    supabaseAdmin.rpc('exam_summary', { p_exam_id: examId }).then(unwrap),
    supabaseAdmin
      .from('exam_attempts')
      .select('id, score, correct_count, incorrect_count, skipped_count, is_late, submitted_at, student:students(id, mobile, admin_label)')
      .eq('exam_id', examId)
      .neq('status', 'in_progress')
      .order('score', { ascending: false })
      .order('submitted_at', { ascending: true })
      .then(unwrap),
    supabaseAdmin.rpc('exam_question_stats', { p_exam_id: examId }).then(unwrap),
    supabaseAdmin
      .from('exam_questions')
      .select('position, question:questions(id, stem, correct_option)')
      .eq('exam_id', examId)
      .order('position')
      .then(unwrap),
  ]);

  // Competition ranking among ranked attempts (ties share a rank; next rank skips).
  let previousScore: number | null = null;
  let previousRank = 0;
  let ranked = 0;
  const table = attempts.map((attempt) => {
    const score = Number(attempt.score);
    const counts = exam.rank_late_attempts || !attempt.is_late;
    let rank: number | null = null;
    if (counts) {
      ranked += 1;
      rank = score === previousScore ? previousRank : ranked;
      previousScore = score;
      previousRank = rank;
    }
    return {
      attemptId: attempt.id,
      rank,
      studentId: attempt.student?.id ?? null,
      mobile: attempt.student?.mobile ?? '',
      label: attempt.student?.admin_label ?? null,
      score,
      correct: attempt.correct_count ?? 0,
      incorrect: attempt.incorrect_count ?? 0,
      skipped: attempt.skipped_count ?? 0,
      isLate: attempt.is_late,
      submittedAt: attempt.submitted_at as string,
    };
  });

  const statsById = new Map(stats.map((s) => [s.question_id, s]));
  const analysis = questions
    .flatMap((row) => (row.question ? [{ position: row.position, ...row.question }] : []))
    .map((q) => {
      const s = statsById.get(q.id);
      const wrong = (['A', 'B', 'C', 'D'] as const)
        .filter((key) => key !== q.correct_option)
        .map((key) => ({ key, count: s ? s[key.toLowerCase() as 'a' | 'b' | 'c' | 'd'] : 0 }))
        .sort((a, b) => b.count - a.count)[0];
      return {
        position: q.position,
        questionId: q.id,
        stemHtml: renderRichText(q.stem),
        correctPercent: s ? Number(s.correct_pct) : 0,
        mostChosenWrong: wrong && wrong.count > 0 ? wrong.key : null,
      };
    })
    .sort((a, b) => a.correctPercent - b.correctPercent);

  const summary = summaryRows[0];
  return {
    exam: { ...exam, totalMarks: exam.question_count * Number(exam.marks_per_question) },
    summary: {
      participants: summary?.participants ?? 0,
      lateParticipants: summary?.late_participants ?? 0,
      average: summary?.avg_score === null || summary?.avg_score === undefined ? null : Number(summary.avg_score),
      highest: summary?.max_score === null || summary?.max_score === undefined ? null : Number(summary.max_score),
      lowest: summary?.min_score === null || summary?.min_score === undefined ? null : Number(summary.min_score),
    },
    table,
    analysis,
  };
}

const csvEscape = (value: string | number | null) => {
  const text = value === null ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** UTF-8 with BOM so Excel opens Bangla correctly. */
export function buildResultsCsv(data: NonNullable<Awaited<ReturnType<typeof getExamResultsAdmin>>>): string {
  const header = ['rank', 'mobile', 'label', 'score', 'total', 'correct', 'incorrect', 'skipped', 'late', 'submitted_at'];
  const lines = data.table.map((row) =>
    [
      row.rank, row.mobile, row.label, row.score, data.exam.totalMarks, row.correct, row.incorrect, row.skipped,
      row.isLate ? 'yes' : 'no', formatDhaka(row.submittedAt),
    ]
      .map(csvEscape)
      .join(','),
  );
  return `﻿${header.join(',')}\n${lines.join('\n')}${lines.length ? '\n' : ''}`;
}
