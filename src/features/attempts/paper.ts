import 'server-only';
import { unwrap } from '@/lib/actions';
import { renderRichText } from '@/lib/content/render';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { signQuestionMedia } from '@/lib/supabase/storage';
import type { OptionKey, PaperQuestion } from '@/types/domain';

/**
 * The ONLY source of question content for in-progress papers (TRD §4.6, §8.2). Reads exclusively
 * from the `paper_questions` view, which has no answer-key columns, so nothing secret can reach the
 * browser. `pnpm check:answer-leak` guards this file.
 */
const KEYS: readonly OptionKey[] = ['A', 'B', 'C', 'D'];

type PaperRow = {
  id: string;
  stem: string;
  stem_image_path: string | null;
  option_a: string;
  option_a_image_path: string | null;
  option_b: string;
  option_b_image_path: string | null;
  option_c: string;
  option_c_image_path: string | null;
  option_d: string;
  option_d_image_path: string | null;
};

/** `order` = display order of canonical keys, e.g. "CABD". Invalid values fall back to ABCD. */
export function displayKeys(order: string | undefined): OptionKey[] {
  const keys = [...(order ?? '')] as OptionKey[];
  return keys.length === 4 && new Set(keys).size === 4 && keys.every((k) => KEYS.includes(k)) ? keys : [...KEYS];
}

export async function buildPaper(input: {
  questionIds: string[];
  optionOrder?: Record<string, string>;
  imageTtlSeconds: number;
}): Promise<PaperQuestion[]> {
  if (input.questionIds.length === 0) return [];
  const rows = unwrap(
    await supabaseAdmin
      .from('paper_questions')
      .select('id, stem, stem_image_path, option_a, option_a_image_path, option_b, option_b_image_path, option_c, option_c_image_path, option_d, option_d_image_path')
      .in('id', input.questionIds),
  ) as PaperRow[];
  const byId = new Map(rows.map((row) => [row.id, row]));

  const urls = await signQuestionMedia(
    rows.flatMap((r) => [r.stem_image_path, r.option_a_image_path, r.option_b_image_path, r.option_c_image_path, r.option_d_image_path]),
    input.imageTtlSeconds,
  );
  const url = (path: string | null) => (path ? (urls.get(path) ?? null) : null);

  return input.questionIds.flatMap((id, index) => {
    const row = byId.get(id);
    if (!row) return [];
    return [
      {
        id,
        n: index + 1,
        stemHtml: renderRichText(row.stem),
        stemImageUrl: url(row.stem_image_path),
        options: displayKeys(input.optionOrder?.[id]).map((key) => {
          const lower = key.toLowerCase() as 'a' | 'b' | 'c' | 'd';
          return { key, html: renderRichText(row[`option_${lower}`]), imageUrl: url(row[`option_${lower}_image_path`]) };
        }),
      },
    ];
  });
}
