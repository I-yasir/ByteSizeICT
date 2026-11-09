import 'server-only';
import { unwrap } from '@/lib/actions';
import { supabaseAdmin } from '@/lib/supabase/admin';

/** Full taxonomy tree for filters, the question editor and /admin/taxonomy. */
export async function getTaxonomy() {
  const subjects = await supabaseAdmin
    .from('subjects')
    .select('id, slug, name_bn, name_en, sort_order, chapters(id, number, name_bn, name_en, sort_order, topics(id, name_bn, name_en, sort_order))')
    .order('sort_order')
    .then(unwrap);
  const bySort = <T extends { sort_order: number }>(a: T, b: T) => a.sort_order - b.sort_order;
  return {
    subjects: subjects.map((subject) => ({
      ...subject,
      chapters: [...subject.chapters]
        .sort((a, b) => a.number - b.number)
        .map((chapter) => ({ ...chapter, topics: [...chapter.topics].sort(bySort) })),
    })),
  };
}
export type Taxonomy = Awaited<ReturnType<typeof getTaxonomy>>;
