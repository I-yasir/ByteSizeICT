-- 0006 — Attempts & answers + exam lock triggers (docs/05_Schema.md §5)

create table public.exam_attempts (
  id                  uuid primary key default gen_random_uuid(),
  exam_id             uuid not null references public.exams(id) on delete restrict,
  student_id          uuid not null references public.students(id) on delete cascade,
  status              public.attempt_status not null default 'in_progress',
  started_at          timestamptz not null default now(),
  deadline_at         timestamptz not null,
  submitted_at        timestamptz,
  is_late             boolean not null default false,
  question_order      uuid[] not null,
  option_order        jsonb not null default '{}'::jsonb,
  score               numeric(7,2),
  correct_count       integer,
  incorrect_count     integer,
  skipped_count       integer,
  last_question_index integer not null default 0,
  tab_switch_count    integer not null default 0,   -- R2 (unused in R1)
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (exam_id, student_id),
  constraint attempts_final_consistency check (
    (status = 'in_progress' and submitted_at is null and score is null) or
    (status <> 'in_progress' and submitted_at is not null and score is not null))
);
create index attempts_exam_rank_idx on public.exam_attempts (exam_id, score desc) where status <> 'in_progress';
create index attempts_student_idx   on public.exam_attempts (student_id, started_at desc);
create index attempts_overdue_idx   on public.exam_attempts (deadline_at) where status = 'in_progress';

create table public.attempt_answers (
  attempt_id       uuid not null references public.exam_attempts(id) on delete cascade,
  question_id      uuid not null references public.questions(id) on delete restrict,
  selected_option  public.option_key,
  is_marked        boolean not null default false,
  client_seq       bigint not null default 0,
  is_correct       boolean,
  updated_at       timestamptz not null default now(),
  primary key (attempt_id, question_id)
);
create index attempt_answers_question_idx on public.attempt_answers (question_id) include (selected_option);

create trigger exam_attempts_updated_at before update on public.exam_attempts for each row execute function public.set_updated_at();

-- Once any attempt exists, the question set and scoring-relevant settings are frozen (PRD A-11).
create or replace function public.exam_questions_lock() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if exists (select 1 from public.exam_attempts where exam_id = coalesce(new.exam_id, old.exam_id)) then
    raise exception 'EXAM_LOCKED' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;
create trigger exam_questions_lock_trg
  before insert or update or delete on public.exam_questions
  for each row execute function public.exam_questions_lock();

create or replace function public.exams_lock() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if exists (select 1 from public.exam_attempts where exam_id = old.id) and (
       new.marks_per_question is distinct from old.marks_per_question
    or new.negative_mark      is distinct from old.negative_mark
    or new.shuffle_questions  is distinct from old.shuffle_questions
    or new.shuffle_options    is distinct from old.shuffle_options
    or new.duration_minutes   is distinct from old.duration_minutes
    or (old.status = 'published' and new.status = 'draft')) then
    raise exception 'EXAM_LOCKED' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger exams_lock_trg
  before update on public.exams
  for each row execute function public.exams_lock();
