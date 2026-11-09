import 'server-only';
import { unwrap, unwrapMaybe } from '@/lib/actions';
import { renderRichText } from '@/lib/content/render';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { examListSchema } from './schemas';
import { computeExamPhase, type ExamPhase } from './status';

/** Admin exam list + builder data (docs/02_AppFlow.md §6.8). */
export async function listExamsAdmin(filter: { phase?: ExamPhase | 'all' } = {}) {
  const { phase } = examListSchema.parse(filter);
  const rows = unwrap(
    await supabaseAdmin
      .from('exams')
      .select('id, title, status, is_sample, is_featured, access_mode, audience, starts_at, live_ends_at, late_until, question_count, exam_attempts(count), exam_audience_plans(plan:plans(code))')
      .order('starts_at', { ascending: false, nullsFirst: true })
      .limit(500),
  );
  return rows
    .map(({ exam_attempts, exam_audience_plans, ...exam }) => ({
      ...exam,
      phase: computeExamPhase(exam),
      attempts: exam_attempts[0]?.count ?? 0,
      planCodes: exam_audience_plans.flatMap((row) => (row.plan ? [row.plan.code] : [])),
    }))
    .filter((exam) => phase === 'all' || exam.phase === phase);
}

export async function getExamForBuilder(id: string) {
  const exam = unwrapMaybe(await supabaseAdmin.from('exams').select('*').eq('id', id).maybeSingle());
  if (!exam) return null;
  const [questions, audiencePlans, attempts] = await Promise.all([
    supabaseAdmin
      .from('exam_questions')
      .select('position, question:questions(id, stem, status, chapter:chapters(number, name_en))')
      .eq('exam_id', id)
      .order('position')
      .then(unwrap),
    supabaseAdmin.from('exam_audience_plans').select('plan_id').eq('exam_id', id).then(unwrap),
    supabaseAdmin.from('exam_attempts').select('id', { count: 'exact', head: true }).eq('exam_id', id),
  ]);
  return {
    exam: { ...exam, phase: computeExamPhase(exam) },
    locked: (attempts.count ?? 0) > 0,
    attemptCount: attempts.count ?? 0,
    questions: questions.flatMap((row) =>
      row.question ? [{ ...row.question, position: row.position, stemHtml: renderRichText(row.question.stem) }] : [],
    ),
    planIds: audiencePlans.map((row) => row.plan_id),
  };
}

/** Admin "Preview as student" (docs/02_AppFlow.md §6.9). Includes the answer key for the admin toggle. */
export async function getExamPreview(id: string) {
  const exam = unwrapMaybe(
    await supabaseAdmin
      .from('exams')
      .select('id, title, duration_minutes, marks_per_question, negative_mark, allow_mark_for_review, question_count')
      .eq('id', id)
      .maybeSingle(),
  );
  if (!exam) return null;
  const rows = unwrap(
    await supabaseAdmin
      .from('exam_questions')
      .select('position, question:questions(id, stem, stem_image_path, option_a, option_a_image_path, option_b, option_b_image_path, option_c, option_c_image_path, option_d, option_d_image_path, correct_option, explanation)')
      .eq('exam_id', id)
      .order('position'),
  );
  const { signQuestionMedia } = await import('@/lib/supabase/storage');
  const questions = rows.flatMap((row) => (row.question ? [row.question] : []));
  const urls = await signQuestionMedia(
    questions.flatMap((q) => [q.stem_image_path, q.option_a_image_path, q.option_b_image_path, q.option_c_image_path, q.option_d_image_path]),
    3600,
  );
  const url = (path: string | null) => (path ? (urls.get(path) ?? null) : null);
  return {
    exam,
    questions: questions.map((q, i) => ({
      id: q.id,
      n: i + 1,
      stemHtml: renderRichText(q.stem),
      stemImageUrl: url(q.stem_image_path),
      options: (['A', 'B', 'C', 'D'] as const).map((key) => {
        const lower = key.toLowerCase() as 'a' | 'b' | 'c' | 'd';
        return { key, html: renderRichText(q[`option_${lower}`]), imageUrl: url(q[`option_${lower}_image_path`]) };
      }),
      correctOption: q.correct_option,
      explanationHtml: renderRichText(q.explanation),
    })),
  };
}
