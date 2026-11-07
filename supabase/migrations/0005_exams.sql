-- 0005 — Exams (docs/05_Schema.md §5). Lock triggers live in 0006 (they reference exam_attempts).

create table public.exams (
  id                     uuid primary key default gen_random_uuid(),
  title                  text not null check (char_length(title) between 1 and 120),
  description            text check (char_length(description) <= 2000),
  subject_id             uuid references public.subjects(id) on delete set null,
  chapter_label          text check (char_length(chapter_label) <= 80),
  status                 public.exam_status not null default 'draft',
  is_sample              boolean not null default false,
  is_featured            boolean not null default false,
  starts_at              timestamptz,
  live_ends_at           timestamptz,
  access_mode            public.access_mode not null default 'fixed',
  late_until             timestamptz,
  duration_minutes       integer not null default 30 check (duration_minutes between 1 and 300),
  marks_per_question     numeric(5,2) not null default 1 check (marks_per_question > 0),
  negative_mark          numeric(5,2) not null default 0 check (negative_mark >= 0),
  shuffle_questions      boolean not null default false,
  shuffle_options        boolean not null default false,
  allow_mark_for_review  boolean not null default true,
  results_publish_at     timestamptz,
  answers_publish_at     timestamptz,
  show_option_stats      boolean not null default true,
  rank_late_attempts     boolean not null default false,
  audience               public.exam_audience not null default 'all_active',
  question_count         integer not null default 0,
  published_at           timestamptz,
  created_by             uuid references public.admins(id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint exams_times check (live_ends_at is null or starts_at is null or live_ends_at > starts_at),
  constraint exams_window check (
    (access_mode = 'window' and late_until is not null and live_ends_at is not null and late_until > live_ends_at)
    or (access_mode <> 'window' and late_until is null)),
  constraint exams_published_has_times check (
    status = 'draft' or is_sample or (starts_at is not null and live_ends_at is not null))
);
create unique index exams_one_featured on public.exams (is_featured) where is_featured;
create unique index exams_one_sample   on public.exams (is_sample) where is_sample and status = 'published';
create index exams_status_starts_idx   on public.exams (status, starts_at);

create table public.exam_questions (
  exam_id      uuid not null references public.exams(id) on delete cascade,
  question_id  uuid not null references public.questions(id) on delete restrict,
  position     integer not null check (position >= 1),
  primary key (exam_id, question_id),
  constraint exam_questions_position_unique unique (exam_id, position) deferrable initially deferred
);
create index exam_questions_question_idx on public.exam_questions (question_id);

create table public.exam_assignees (
  exam_id     uuid not null references public.exams(id) on delete cascade,
  student_id  uuid not null references public.students(id) on delete cascade,
  primary key (exam_id, student_id)
);
create index exam_assignees_student_idx on public.exam_assignees (student_id);

create or replace function public.exam_questions_recount() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  v_exam uuid := coalesce(new.exam_id, old.exam_id);
begin
  update public.exams
     set question_count = (select count(*) from public.exam_questions where exam_id = v_exam)
   where id = v_exam;
  return null;
end $$;
create trigger exam_questions_count_trg
  after insert or delete on public.exam_questions
  for each row execute function public.exam_questions_recount();

create trigger exams_updated_at before update on public.exams for each row execute function public.set_updated_at();
