import 'server-only';
import type { z } from 'zod';
import { check, ServiceError, unwrap } from '@/lib/actions';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { chapterSchema, subjectSchema, topicSchema } from './schemas';

/** Taxonomy writes. Unique violations (duplicate slug/number/name) surface as VALIDATION. */
function uniqueAware<T>(result: { data: T; error: { message?: string; code?: string } | null }, field: string): NonNullable<T> {
  if (result.error?.code === '23505') throw new ServiceError('VALIDATION', { field });
  return unwrap(result);
}

export async function upsertSubject(input: z.output<typeof subjectSchema>) {
  const row = { slug: input.slug, name_bn: input.nameBn, name_en: input.nameEn, sort_order: input.sortOrder };
  return uniqueAware(
    await (input.id
      ? supabaseAdmin.from('subjects').update(row).eq('id', input.id).select('id').single()
      : supabaseAdmin.from('subjects').insert(row).select('id').single()),
    'slug',
  );
}

export async function upsertChapter(input: z.output<typeof chapterSchema>) {
  const row = { subject_id: input.subjectId, number: input.number, name_bn: input.nameBn, name_en: input.nameEn, sort_order: input.sortOrder };
  return uniqueAware(
    await (input.id
      ? supabaseAdmin.from('chapters').update(row).eq('id', input.id).select('id').single()
      : supabaseAdmin.from('chapters').insert(row).select('id').single()),
    'number',
  );
}

export async function upsertTopic(input: z.output<typeof topicSchema>) {
  const row = { chapter_id: input.chapterId, name_bn: input.nameBn, name_en: input.nameEn, sort_order: input.sortOrder };
  return uniqueAware(
    await (input.id
      ? supabaseAdmin.from('topics').update(row).eq('id', input.id).select('id').single()
      : supabaseAdmin.from('topics').insert(row).select('id').single()),
    'nameEn',
  );
}

/** Topics are deletable only when no question uses them (FK would silently null them otherwise). */
export async function deleteTopic(id: string): Promise<{ deleted: true }> {
  const { count, error } = await supabaseAdmin.from('questions').select('id', { count: 'exact', head: true }).eq('topic_id', id).is('deleted_at', null);
  check({ error });
  if ((count ?? 0) > 0) throw new ServiceError('VALIDATION', { field: 'topic', meta: { questionCount: count } });
  check(await supabaseAdmin.from('topics').delete().eq('id', id));
  return { deleted: true };
}
