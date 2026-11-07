import 'server-only';
import { logAdminAudit } from '@/features/audit/log';
import { check, ServiceError, unwrap, unwrapMaybe } from '@/lib/actions';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { ExamSettingsInput } from './schemas';
import { computeExamPhase, defaultPublishAt } from './status';

/** Exam builder (docs/02_AppFlow.md §6.8). DB triggers enforce the post-attempt locks. */

function validateTimes(s: ExamSettingsInput & { liveEndsAt: string | null }) {
  if (s.isSample) return;
  const starts = s.startsAt ? Date.parse(s.startsAt) : null;
  const ends = s.liveEndsAt ? Date.parse(s.liveEndsAt) : null;
  if (starts !== null && ends !== null && ends <= starts) throw new ServiceError('EXAM_INVALID_TIMES', { field: 'liveEndsAt' });
  if (s.accessMode === 'window' && (!s.lateUntil || ends === null || Date.parse(s.lateUntil) <= ends)) {
    throw new ServiceError('EXAM_INVALID_TIMES', { field: 'lateUntil' });
  }
}

function toRow(s: ExamSettingsInput) {
  // Default live window = start + duration (docs/02_AppFlow.md §6.8).
  const liveEndsAt =
    s.liveEndsAt ?? (s.startsAt ? new Date(Date.parse(s.startsAt) + s.durationMinutes * 60_000).toISOString() : null);
  const settings = { ...s, liveEndsAt };
  validateTimes(settings);
  return {
    title: s.title,
    description: s.description,
    subject_id: s.subjectId,
    chapter_label: s.chapterLabel,
    is_sample: s.isSample,
    starts_at: s.isSample ? null : s.startsAt,
    live_ends_at: s.isSample ? null : liveEndsAt,
    access_mode: s.isSample ? ('always' as const) : s.accessMode,
    late_until: !s.isSample && s.accessMode === 'window' ? s.lateUntil : null,
    duration_minutes: s.durationMinutes,
    marks_per_question: s.marksPerQuestion,
    negative_mark: s.negativeMark,
    shuffle_questions: s.shuffleQuestions,
    shuffle_options: s.shuffleOptions,
    allow_mark_for_review: s.allowMarkForReview,
    results_publish_at: s.resultsPublishAt,
    answers_publish_at: s.answersPublishAt,
    show_option_stats: s.showOptionStats,
    rank_late_attempts: s.rankLateAttempts,
  };
}

/** Constraint violations on exams are time problems; everything else maps normally. */
function examResult<T>(result: { data: T; error: { message?: string; code?: string } | null }): NonNullable<T> {
  if (result.error?.code === '23514') throw new ServiceError('EXAM_INVALID_TIMES');
  return unwrap(result);
}

export async function createExam(adminId: string, settings: ExamSettingsInput): Promise<{ id: string }> {
  const { id } = examResult(
    await supabaseAdmin.from('exams').insert({ ...toRow(settings), status: 'draft', created_by: adminId }).select('id').single(),
  );
  await logAdminAudit({ adminId, action: 'exam.create', entityType: 'exam', entityId: id, after: { title: settings.title } });
  return { id };
}

export async function updateExamSettings(id: string, settings: ExamSettingsInput): Promise<{ id: string }> {
  const rows = examResult(await supabaseAdmin.from('exams').update(toRow(settings)).eq('id', id).select('id'));
  if (rows.length === 0) throw new ServiceError('NOT_FOUND');
  return { id };
}

export async function setExamQuestions(id: string, questionIds: string[]): Promise<{ count: number }> {
  return { count: unwrap(await supabaseAdmin.rpc('set_exam_questions', { p_exam_id: id, p_question_ids: questionIds })) };
}

export async function setExamAudience(
  id: string,
  audience: 'all_active' | 'selected',
  studentIds: string[],
): Promise<{ assigned: number }> {
  const assigned = unwrap(
    await supabaseAdmin.rpc('set_exam_audience', { p_exam_id: id, p_audience: audience, p_student_ids: studentIds }),
  );
  return { assigned };
}

async function loadExam(id: string) {
  const exam = unwrapMaybe(await supabaseAdmin.from('exams').select('*').eq('id', id).maybeSingle());
  if (!exam) throw new ServiceError('NOT_FOUND');
  return exam;
}

/** Publish checklist (docs/02_AppFlow.md §6.8) + publish-time defaults. */
export async function publishExam(adminId: string, id: string): Promise<{ id: string }> {
  const exam = await loadExam(id);
  if (exam.status === 'published') return { id };
  if (exam.question_count === 0) throw new ServiceError('EXAM_NO_QUESTIONS');

  const inactive = unwrap(
    await supabaseAdmin.from('exam_questions').select('question:questions!inner(status)').eq('exam_id', id).neq('question.status', 'active'),
  );
  if (inactive.length > 0) throw new ServiceError('EXAM_INACTIVE_QUESTIONS');

  if (!exam.is_sample) {
    if (!exam.starts_at || !exam.live_ends_at) throw new ServiceError('EXAM_INVALID_TIMES', { field: 'startsAt' });
    if (exam.audience === 'selected') {
      const { count } = await supabaseAdmin.from('exam_assignees').select('student_id', { count: 'exact', head: true }).eq('exam_id', id);
      if (!count) throw new ServiceError('VALIDATION', { field: 'audience' });
    }
  }

  const fallback = exam.is_sample ? null : defaultPublishAt(exam);
  const result = await supabaseAdmin
    .from('exams')
    .update({
      status: 'published',
      published_at: new Date().toISOString(),
      results_publish_at: exam.results_publish_at ?? fallback,
      answers_publish_at: exam.answers_publish_at ?? fallback,
    })
    .eq('id', id);
  // another sample exam already published
  if (result.error?.code === '23505') throw new ServiceError('VALIDATION', { field: 'isSample' });
  check(result);
  await logAdminAudit({ adminId, action: 'exam.publish', entityType: 'exam', entityId: id });
  return { id };
}

export async function unpublishExam(adminId: string, id: string): Promise<{ id: string }> {
  await loadExam(id);
  // exams_lock trigger raises EXAM_LOCKED once attempts exist
  check(await supabaseAdmin.from('exams').update({ status: 'draft', is_featured: false, published_at: null }).eq('id', id));
  await logAdminAudit({ adminId, action: 'exam.unpublish', entityType: 'exam', entityId: id });
  return { id };
}

export async function archiveExam(adminId: string, id: string): Promise<{ id: string }> {
  const exam = await loadExam(id);
  if (computeExamPhase(exam) !== 'closed') throw new ServiceError('VALIDATION', { field: 'status' });
  check(await supabaseAdmin.from('exams').update({ status: 'archived', is_featured: false }).eq('id', id));
  await logAdminAudit({ adminId, action: 'exam.archive', entityType: 'exam', entityId: id });
  return { id };
}

/** One featured exam at most (homepage strip, PRD A-13). `null` clears it. */
export async function setFeaturedExam(adminId: string, id: string | null): Promise<{ id: string | null }> {
  if (id) {
    const exam = await loadExam(id);
    if (exam.status !== 'published' || exam.is_sample) throw new ServiceError('VALIDATION', { field: 'isFeatured' });
  }
  check(await supabaseAdmin.from('exams').update({ is_featured: false }).eq('is_featured', true));
  if (id) check(await supabaseAdmin.from('exams').update({ is_featured: true }).eq('id', id));
  await logAdminAudit({ adminId, action: 'exam.feature', entityType: 'exam', entityId: id, meta: { featured: Boolean(id) } });
  return { id };
}
