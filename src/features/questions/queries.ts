import 'server-only';
import { unwrap, unwrapMaybe } from '@/lib/actions';
import { renderRichText } from '@/lib/content/render';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { escapeLike, type Paged, pageRange } from '@/lib/validation';
import { type QuestionSearch, questionSearchSchema } from './schemas';

/** Question bank search (PRD A-09). Admin-only: rows include the answer key. */
const LIST_COLUMNS =
  'id, stem, status, difficulty, qtype, correct_option, times_used, times_answered, times_correct, correct_rate, created_at, chapter:chapters(id, number, name_en, name_bn, subject_id), topic:topics(id, name_en, name_bn), question_tags(tag:tags(id, name))';

export async function searchQuestions(search: QuestionSearch = {}) {
  const s = questionSearchSchema.parse(search);
  const empty = { items: [], total: 0, page: s.page, pageSize: s.pageSize };

  let restrictIds: string[] | null = null;
  if (s.tagIds.length > 0) {
    // all-of semantics: a question must carry every selected tag
    const rows = unwrap(await supabaseAdmin.from('question_tags').select('question_id, tag_id').in('tag_id', s.tagIds));
    const counts = new Map<string, number>();
    for (const row of rows) counts.set(row.question_id, (counts.get(row.question_id) ?? 0) + 1);
    restrictIds = [...counts.entries()].filter(([, n]) => n === s.tagIds.length).map(([id]) => id);
    if (restrictIds.length === 0) return empty;
  }

  let chapterIds: string[] | null = null;
  if (s.subjectId && !s.chapterId) {
    chapterIds = unwrap(await supabaseAdmin.from('chapters').select('id').eq('subject_id', s.subjectId)).map((c) => c.id);
    if (chapterIds.length === 0) return empty;
  }

  let query = supabaseAdmin.from('questions').select(LIST_COLUMNS, { count: 'exact' }).in('status', s.status);
  if (restrictIds) query = query.in('id', restrictIds);
  if (chapterIds) query = query.in('chapter_id', chapterIds);
  if (s.chapterId) query = query.eq('chapter_id', s.chapterId);
  if (s.topicId) query = query.eq('topic_id', s.topicId);
  if (s.difficulty) query = query.eq('difficulty', s.difficulty);
  if (s.qtype) query = query.eq('qtype', s.qtype);
  if (s.unusedOnly) query = query.eq('times_used', 0);
  if (s.q?.trim()) query = query.ilike('stem', `%${escapeLike(s.q.trim())}%`);

  query =
    s.sort === 'most_used'
      ? query.order('times_used', { ascending: false }).order('created_at', { ascending: false })
      : s.sort === 'lowest_correct'
        ? query.order('correct_rate', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false })
        : query.order('created_at', { ascending: false });

  const { data, count, error } = await query.range(...pageRange(s));
  const rows = unwrap({ data, error });
  return {
    items: rows.map(({ question_tags, ...row }) => ({
      ...row,
      stemHtml: renderRichText(row.stem),
      tags: question_tags.map((qt) => qt.tag).filter((tag): tag is { id: string; name: string } => Boolean(tag)),
      correctPercent: row.correct_rate === null ? null : Math.round(Number(row.correct_rate) * 1000) / 10,
    })),
    total: count ?? 0,
    page: s.page,
    pageSize: s.pageSize,
  } satisfies Paged<unknown>;
}

/** Full record for the editor (admin only). */
export async function getQuestionForEdit(id: string) {
  const row = unwrapMaybe(
    await supabaseAdmin.from('questions').select('*, chapter:chapters(subject_id), question_tags(tag_id)').eq('id', id).maybeSingle(),
  );
  if (!row) return null;
  const { question_tags, ...question } = row;
  return { ...question, tagIds: question_tags.map((qt) => qt.tag_id) };
}
