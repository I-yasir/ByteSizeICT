import 'server-only';
import { z } from 'zod';
import { buildPaper } from '@/features/attempts/paper';
import { buildReview } from '@/features/results/review';
import { ServiceError, unwrap, unwrapMaybe } from '@/lib/actions';
import { consume } from '@/lib/rate-limit';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { OptionKey, PaperQuestion, ReviewQuestion } from '@/types/domain';

/**
 * Trial (sample) exam (PRD V-05, docs/02_AppFlow.md §4.5): paper without answers; scoring is stateless
 * and server-side. Nothing is stored except rate-limit events.
 */
async function loadSample() {
  const exam = unwrapMaybe(
    await supabaseAdmin
      .from('exams')
      .select('id, title, duration_minutes, marks_per_question, negative_mark, allow_mark_for_review')
      .eq('is_sample', true)
      .eq('status', 'published')
      .maybeSingle(),
  );
  if (!exam) return null;
  const ids = unwrap(
    await supabaseAdmin.from('exam_questions').select('question_id').eq('exam_id', exam.id).order('position'),
  ).map((row) => row.question_id);
  return { exam, ids };
}

export type SamplePaper = {
  exam: { id: string; title: string; durationMinutes: number; marksPerQuestion: number; negativeMark: number; allowMarkForReview: boolean; questionCount: number; totalMarks: number };
  questions: PaperQuestion[];
};

export async function getSamplePaper(): Promise<SamplePaper | null> {
  const sample = await loadSample();
  if (!sample || sample.ids.length === 0) return null;
  const questions = await buildPaper({ questionIds: sample.ids, imageTtlSeconds: 3 * 3600 });
  const { exam } = sample;
  return {
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
    questions,
  };
}

export const sampleScoreSchema = z.object({
  answers: z.record(z.uuid(), z.enum(['A', 'B', 'C', 'D']).nullable()),
});

export type SampleResult = {
  score: number;
  total: number;
  correct: number;
  incorrect: number;
  skipped: number;
  accuracy: number | null;
  questions: ReviewQuestion[];
};

export async function scoreSample(answers: Record<string, OptionKey | null>, ip: string): Promise<SampleResult> {
  if ((await consume('sample_ip', ip)).limited) throw new ServiceError('RATE_LIMITED');
  const sample = await loadSample();
  if (!sample || sample.ids.length === 0) throw new ServiceError('NOT_FOUND');

  const keys = unwrap(await supabaseAdmin.from('questions').select('id, correct_option').in('id', sample.ids));
  const answerKey = new Map(keys.map((row) => [row.id, row.correct_option as OptionKey]));
  let correct = 0;
  let incorrect = 0;
  for (const id of sample.ids) {
    const chosen = answers[id] ?? null; // answers for questions outside the sample are ignored
    if (chosen === null) continue;
    if (chosen === answerKey.get(id)) correct += 1;
    else incorrect += 1;
  }
  const mpq = Number(sample.exam.marks_per_question);
  const questions = await buildReview({
    questionIds: sample.ids,
    optionOrder: {},
    selections: new Map(sample.ids.map((id) => [id, { selected: answers[id] ?? null, marked: false }])),
    answersVisible: true,
    stats: null,
  });
  return {
    score: computeScore({ correct, incorrect, marksPerQuestion: mpq, negativeMark: Number(sample.exam.negative_mark) }),
    total: sample.ids.length * mpq,
    correct,
    incorrect,
    skipped: sample.ids.length - correct - incorrect,
    accuracy: correct + incorrect === 0 ? null : Math.round((correct / (correct + incorrect)) * 1000) / 10,
    questions,
  };
}

/**
 * Mirrors SQL `score_attempt` (TRD §8.5): +marks per correct, −negative per wrong, 0 for skipped,
 * rounded to 2 decimals and never clamped (scores can be negative).
 */
export function computeScore(t: { correct: number; incorrect: number; marksPerQuestion: number; negativeMark: number }): number {
  const raw = t.correct * t.marksPerQuestion - t.incorrect * t.negativeMark;
  return Math.round((raw + Number.EPSILON * Math.sign(raw)) * 100) / 100;
}
