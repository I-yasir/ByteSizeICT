-- 0014 — R1.1 (CR10, Plan V2.04): remove question difficulty, type, source, board year and tags with
-- every object that depends on them (docs/05_Schema.md §5, §10). Destructive by design: the owner
-- approved a clean start (D10/D11); production is backed up before the cut-over (V2.38).

drop function if exists public.set_question_tags(uuid, uuid[]);

drop table if exists public.question_tags;
drop table if exists public.tags;

-- The updated_at trigger lists its columns (0004), so it depends on the dropped ones: rebuild it.
drop trigger if exists questions_updated_at on public.questions;

-- questions_difficulty_idx goes with its column.
alter table public.questions
  drop column if exists difficulty,
  drop column if exists qtype,
  drop column if exists source,
  drop column if exists board_year;

-- Content edits only: usage counters updated during scoring must not bump updated_at (as in 0004).
create trigger questions_updated_at
  before update of chapter_id, topic_id, stem, stem_image_path, option_a, option_a_image_path, option_b,
                   option_b_image_path, option_c, option_c_image_path, option_d, option_d_image_path,
                   correct_option, explanation, explanation_image_path, status
  on public.questions for each row execute function public.set_updated_at();

drop type if exists public.difficulty_level;
drop type if exists public.question_type;
