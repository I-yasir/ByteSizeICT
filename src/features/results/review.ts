import 'server-only';
import { displayKeys } from '@/features/attempts/paper';
import { unwrap } from '@/lib/actions';
import { renderRichText } from '@/lib/content/render';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { signQuestionMedia } from '@/lib/supabase/storage';
import type { OptionKey, OptionStats, QuestionStatus, ReviewQuestion } from '@/types/domain';

/**
 * Builds review cards AFTER an attempt is final. Answer-key fields are read only when `answersVisible`
 * is true; otherwise only the answer-free view is queried (docs/02_AppFlow.md §5.5).
 */
type FullRow = {
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
  correct_option?: OptionKey;
  explanation?: string | null;
  explanation_image_path?: string | null;
};

const BASE_COLUMNS =
  'id, stem, stem_image_path, option_a, option_a_image_path, option_b, option_b_image_path, option_c, option_c_image_path, option_d, option_d_image_path';

export async function buildReview(input: {
  questionIds: string[];
  optionOrder: Record<string, string>;
  selections: Map<string, { selected: OptionKey | null; marked: boolean }>;
  answersVisible: boolean;
  stats: Map<string, OptionStats> | null;
}): Promise<ReviewQuestion[]> {
  if (input.questionIds.length === 0) return [];
  const rows = (
    input.answersVisible
      ? unwrap(
          await supabaseAdmin
            .from('questions')
            .select(`${BASE_COLUMNS}, correct_option, explanation, explanation_image_path`)
            .in('id', input.questionIds),
        )
      : unwrap(await supabaseAdmin.from('paper_questions').select(BASE_COLUMNS).in('id', input.questionIds))
  ) as FullRow[];
  const byId = new Map(rows.map((row) => [row.id, row]));

  const urls = await signQuestionMedia(
    rows.flatMap((r) => [
      r.stem_image_path, r.option_a_image_path, r.option_b_image_path, r.option_c_image_path, r.option_d_image_path,
      r.explanation_image_path ?? null,
    ]),
    3600,
  );
  const url = (path: string | null | undefined) => (path ? (urls.get(path) ?? null) : null);

  return input.questionIds.flatMap((id, index) => {
    const row = byId.get(id);
    if (!row) return [];
    const mine = input.selections.get(id) ?? { selected: null, marked: false };
    const correct = input.answersVisible ? (row.correct_option ?? null) : null;
    const status: QuestionStatus | null = !input.answersVisible
      ? null
      : mine.selected === null
        ? 'skipped'
        : mine.selected === correct
          ? 'correct'
          : 'incorrect';
    return [
      {
        id,
        n: index + 1,
        stemHtml: renderRichText(row.stem),
        stemImageUrl: url(row.stem_image_path),
        options: displayKeys(input.optionOrder[id]).map((key) => {
          const lower = key.toLowerCase() as 'a' | 'b' | 'c' | 'd';
          return { key, html: renderRichText(row[`option_${lower}`]), imageUrl: url(row[`option_${lower}_image_path`]) };
        }),
        selected: mine.selected,
        marked: mine.marked,
        status,
        correctOption: correct,
        explanationHtml: input.answersVisible ? renderRichText(row.explanation ?? '') || null : null,
        explanationImageUrl: input.answersVisible ? url(row.explanation_image_path) : null,
        stats: input.stats?.get(id) ?? null,
      },
    ];
  });
}
