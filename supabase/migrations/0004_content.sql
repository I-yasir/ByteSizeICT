-- 0004 — Question bank (docs/05_Schema.md §5)

create table public.subjects (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name_bn     text not null,
  name_en     text not null,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.chapters (
  id          uuid primary key default gen_random_uuid(),
  subject_id  uuid not null references public.subjects(id) on delete restrict,
  number      smallint not null check (number between 1 and 50),
  name_bn     text not null,
  name_en     text not null,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (subject_id, number)
);

create table public.topics (
  id          uuid primary key default gen_random_uuid(),
  chapter_id  uuid not null references public.chapters(id) on delete restrict,
  name_bn     text not null,
  name_en     text not null,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (chapter_id, name_en)
);

create table public.tags (
  id          uuid primary key default gen_random_uuid(),
  name        extensions.citext not null unique check (char_length(name) between 1 and 40),
  created_at  timestamptz not null default now()
);

create table public.questions (
  id                      uuid primary key default gen_random_uuid(),
  chapter_id              uuid not null references public.chapters(id) on delete restrict,
  topic_id                uuid references public.topics(id) on delete set null,
  stem                    text not null check (char_length(stem) between 1 and 4000),
  stem_image_path         text,
  option_a                text not null default '' check (char_length(option_a) <= 1000),
  option_a_image_path     text,
  option_b                text not null default '' check (char_length(option_b) <= 1000),
  option_b_image_path     text,
  option_c                text not null default '' check (char_length(option_c) <= 1000),
  option_c_image_path     text,
  option_d                text not null default '' check (char_length(option_d) <= 1000),
  option_d_image_path     text,
  correct_option          public.option_key not null,
  explanation             text check (char_length(explanation) <= 8000),
  explanation_image_path  text,
  difficulty              public.difficulty_level not null default 'medium',
  qtype                   public.question_type not null default 'knowledge',
  source                  text check (char_length(source) <= 120),
  board_year              smallint check (board_year between 2000 and 2100),
  status                  public.content_status not null default 'draft',
  content_hash            text not null,
  times_used              integer not null default 0,
  times_answered          integer not null default 0,
  times_correct           integer not null default 0,
  created_by              uuid references public.admins(id) on delete set null,
  updated_by              uuid references public.admins(id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint questions_options_present check (
    (option_a <> '' or option_a_image_path is not null) and (option_b <> '' or option_b_image_path is not null) and
    (option_c <> '' or option_c_image_path is not null) and (option_d <> '' or option_d_image_path is not null))
);
create index questions_chapter_status_idx on public.questions (chapter_id, status);
create index questions_topic_idx          on public.questions (topic_id);
create index questions_difficulty_idx     on public.questions (difficulty);
create index questions_hash_idx           on public.questions (content_hash);
create index questions_stem_trgm_idx      on public.questions using gin (stem extensions.gin_trgm_ops);
create index questions_created_idx        on public.questions (created_at desc);

create table public.question_tags (
  question_id uuid not null references public.questions(id) on delete cascade,
  tag_id      uuid not null references public.tags(id) on delete cascade,
  primary key (question_id, tag_id)
);
create index question_tags_tag_idx on public.question_tags (tag_id);

-- content_hash: sha256 of stem + options, each lower-cased, whitespace-collapsed and trimmed
create or replace function public.questions_set_hash() returns trigger
language plpgsql set search_path = public, extensions, pg_temp as $$
declare
  norm text;
begin
  norm := concat_ws('|',
    lower(btrim(regexp_replace(new.stem, '\s+', ' ', 'g'))),
    lower(btrim(regexp_replace(new.option_a, '\s+', ' ', 'g'))),
    lower(btrim(regexp_replace(new.option_b, '\s+', ' ', 'g'))),
    lower(btrim(regexp_replace(new.option_c, '\s+', ' ', 'g'))),
    lower(btrim(regexp_replace(new.option_d, '\s+', ' ', 'g'))));
  new.content_hash := encode(extensions.digest(norm, 'sha256'), 'hex');
  return new;
end $$;
create trigger questions_hash_trg
  before insert or update of stem, option_a, option_b, option_c, option_d on public.questions
  for each row execute function public.questions_set_hash();

create or replace function public.questions_check_topic() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.topic_id is not null and not exists
     (select 1 from public.topics t where t.id = new.topic_id and t.chapter_id = new.chapter_id) then
    raise exception 'TOPIC_CHAPTER_MISMATCH' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger questions_topic_trg
  before insert or update of topic_id, chapter_id on public.questions
  for each row execute function public.questions_check_topic();

create trigger subjects_updated_at before update on public.subjects for each row execute function public.set_updated_at();
create trigger chapters_updated_at before update on public.chapters for each row execute function public.set_updated_at();
create trigger topics_updated_at   before update on public.topics   for each row execute function public.set_updated_at();
-- Content edits only: usage counters updated during scoring must not bump updated_at.
create trigger questions_updated_at
  before update of chapter_id, topic_id, stem, stem_image_path, option_a, option_a_image_path, option_b,
                   option_b_image_path, option_c, option_c_image_path, option_d, option_d_image_path,
                   correct_option, explanation, explanation_image_path, difficulty, qtype, source,
                   board_year, status
  on public.questions for each row execute function public.set_updated_at();
