import 'server-only';
import { check, ServiceError, unwrap } from '@/lib/actions';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { QUESTION_MEDIA_BUCKET } from '@/lib/supabase/storage';
import type { QuestionInput } from './schemas';

/** Question bank writes (docs/02_AppFlow.md §6.5–6.6). */

function toRow(q: QuestionInput, adminId: string) {
  return {
    chapter_id: q.chapterId,
    topic_id: q.topicId,
    stem: q.stem,
    stem_image_path: q.stemImagePath,
    option_a: q.optionA,
    option_a_image_path: q.optionAImagePath,
    option_b: q.optionB,
    option_b_image_path: q.optionBImagePath,
    option_c: q.optionC,
    option_c_image_path: q.optionCImagePath,
    option_d: q.optionD,
    option_d_image_path: q.optionDImagePath,
    correct_option: q.correctOption,
    explanation: q.explanation,
    explanation_image_path: q.explanationImagePath,
    difficulty: q.difficulty,
    qtype: q.qtype,
    source: q.source,
    board_year: q.boardYear,
    status: q.status,
    updated_by: adminId,
  };
}

/** Same normalisation as the DB trigger, computed by the DB (question_content_hash). */
export async function contentHashes(items: { stem: string; a: string; b: string; c: string; d: string }[]): Promise<string[]> {
  if (items.length === 0) return [];
  const rows = unwrap(await supabaseAdmin.rpc('content_hashes', { p_items: items }));
  const hashes: string[] = new Array(items.length);
  for (const row of rows) hashes[row.idx] = row.hash;
  return hashes;
}

async function findDuplicate(q: QuestionInput, excludeId?: string): Promise<string | null> {
  const [hash] = await contentHashes([{ stem: q.stem, a: q.optionA, b: q.optionB, c: q.optionC, d: q.optionD }]);
  let query = supabaseAdmin.from('questions').select('id').eq('content_hash', hash as string).limit(1);
  if (excludeId) query = query.neq('id', excludeId);
  const rows = unwrap(await query);
  return rows[0]?.id ?? null;
}

async function assertTopicInChapter(q: QuestionInput) {
  if (!q.topicId) return;
  const topic = unwrap(await supabaseAdmin.from('topics').select('chapter_id').eq('id', q.topicId).maybeSingle());
  if (!topic || topic.chapter_id !== q.chapterId) throw new ServiceError('VALIDATION', { field: 'topicId' });
}

export async function createQuestion(adminId: string, q: QuestionInput, force = false): Promise<{ id: string }> {
  await assertTopicInChapter(q);
  if (!force) {
    const duplicateId = await findDuplicate(q);
    if (duplicateId) throw new ServiceError('QUESTION_DUPLICATE', { meta: { duplicateId } });
  }
  const { id } = unwrap(
    await supabaseAdmin.from('questions').insert({ ...toRow(q, adminId), created_by: adminId }).select('id').single(),
  );
  check(await supabaseAdmin.rpc('set_question_tags', { p_question_id: id, p_tag_ids: q.tagIds }));
  return { id };
}

export async function updateQuestion(adminId: string, id: string, q: QuestionInput, force = false): Promise<{ id: string }> {
  await assertTopicInChapter(q);
  if (!force) {
    const duplicateId = await findDuplicate(q, id);
    if (duplicateId) throw new ServiceError('QUESTION_DUPLICATE', { meta: { duplicateId } });
  }
  // The DB trigger raises QUESTION_LOCKED_CORRECT_OPTION if the answer key changes after use.
  const updated = unwrap(await supabaseAdmin.from('questions').update(toRow(q, adminId)).eq('id', id).select('id'));
  if (updated.length === 0) throw new ServiceError('NOT_FOUND');
  check(await supabaseAdmin.rpc('set_question_tags', { p_question_id: id, p_tag_ids: q.tagIds }));
  return { id };
}

export async function duplicateQuestion(adminId: string, id: string): Promise<{ id: string }> {
  const source = unwrap(await supabaseAdmin.from('questions').select('*, question_tags(tag_id)').eq('id', id).maybeSingle());
  if (!source) throw new ServiceError('NOT_FOUND');
  const {
    id: _id, content_hash: _hash, created_at: _c, updated_at: _u, times_used: _tu, times_answered: _ta,
    times_correct: _tc, correct_rate: _cr, question_tags: tags, ...copy
  } = source;
  const created = unwrap(
    await supabaseAdmin
      .from('questions')
      .insert({ ...copy, status: 'draft', created_by: adminId, updated_by: adminId })
      .select('id')
      .single(),
  );
  check(await supabaseAdmin.rpc('set_question_tags', { p_question_id: created.id, p_tag_ids: tags.map((t) => t.tag_id) }));
  return { id: created.id };
}

export async function setQuestionStatus(ids: string[], status: 'draft' | 'active' | 'archived'): Promise<{ updated: number }> {
  const rows = unwrap(await supabaseAdmin.from('questions').update({ status }).in('id', ids).select('id'));
  return { updated: rows.length };
}

export async function bulkTag(ids: string[], tagIds: string[], op: 'add' | 'remove'): Promise<{ updated: number }> {
  if (op === 'add') {
    const pairs = ids.flatMap((question_id) => tagIds.map((tag_id) => ({ question_id, tag_id })));
    check(await supabaseAdmin.from('question_tags').upsert(pairs, { onConflict: 'question_id,tag_id', ignoreDuplicates: true }));
  } else {
    check(await supabaseAdmin.from('question_tags').delete().in('question_id', ids).in('tag_id', tagIds));
  }
  return { updated: ids.length };
}

/** Signed upload URL for an admin image upload (≤ 1 MB, png/jpeg/webp enforced by the bucket). */
export async function createMediaUploadUrl(ext: 'png' | 'jpg' | 'jpeg' | 'webp') {
  const path = `questions/${crypto.randomUUID()}.${ext}`;
  const data = unwrap(await supabaseAdmin.storage.from(QUESTION_MEDIA_BUCKET).createSignedUploadUrl(path));
  return { path, signedUrl: data.signedUrl, token: data.token };
}

/** "Used in {n} exams with attempts" banner (docs/02_AppFlow.md §6.6). */
export async function questionUsage(id: string): Promise<{ examsWithAttempts: number }> {
  const rows = unwrap(
    await supabaseAdmin.from('exam_questions').select('exam_id, exam:exams!inner(exam_attempts!inner(id))').eq('question_id', id),
  );
  return { examsWithAttempts: new Set(rows.map((row) => row.exam_id)).size };
}
