-- 0013 — Phase 2 support: shared content hash, import batches, atomic setters, correct-option lock.

------------------------------------------------------------------------------- content hash
-- Single definition used by the trigger and by bulk import duplicate detection.
create or replace function public.question_content_hash(p_stem text, p_a text, p_b text, p_c text, p_d text)
returns text
language sql immutable set search_path = public, extensions, pg_temp as $$
  select encode(extensions.digest(concat_ws('|',
    lower(btrim(regexp_replace(coalesce(p_stem, ''), '\s+', ' ', 'g'))),
    lower(btrim(regexp_replace(coalesce(p_a, ''),    '\s+', ' ', 'g'))),
    lower(btrim(regexp_replace(coalesce(p_b, ''),    '\s+', ' ', 'g'))),
    lower(btrim(regexp_replace(coalesce(p_c, ''),    '\s+', ' ', 'g'))),
    lower(btrim(regexp_replace(coalesce(p_d, ''),    '\s+', ' ', 'g')))), 'sha256'), 'hex')
$$;

create or replace function public.questions_set_hash() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  new.content_hash := public.question_content_hash(new.stem, new.option_a, new.option_b, new.option_c, new.option_d);
  return new;
end $$;

-- Batch variant for import previews: [{ "stem", "a", "b", "c", "d" }] → (idx, hash), idx 0-based.
create or replace function public.content_hashes(p_items jsonb)
returns table (idx integer, hash text)
language sql stable security definer set search_path = public, pg_temp as $$
  select (t.ord - 1)::integer,
         public.question_content_hash(t.item ->> 'stem', t.item ->> 'a', t.item ->> 'b', t.item ->> 'c', t.item ->> 'd')
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as t(item, ord)
$$;

-- Always overwritten by the trigger; the default only makes inserts type-check without a dummy value.
alter table public.questions alter column content_hash set default '';

------------------------------------------------------------------------------- question stats & lock
alter table public.questions
  add column correct_rate numeric generated always as
    (case when times_answered = 0 then null else round(times_correct::numeric / times_answered, 4) end) stored;
create index questions_correct_rate_idx on public.questions (correct_rate);
create index questions_times_used_idx   on public.questions (times_used desc);

-- Changing the answer key of a question that appears in an exam with attempts would silently
-- change past results (docs/02_AppFlow.md §6.6).
create or replace function public.questions_lock_correct_option() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.correct_option is distinct from old.correct_option and exists (
       select 1 from public.exam_questions eq
         join public.exam_attempts a on a.exam_id = eq.exam_id
        where eq.question_id = old.id) then
    raise exception 'QUESTION_LOCKED_CORRECT_OPTION' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger questions_lock_correct_option_trg
  before update of correct_option on public.questions
  for each row execute function public.questions_lock_correct_option();

------------------------------------------------------------------------------- import batches
create table public.question_import_batches (
  id          uuid primary key default gen_random_uuid(),
  admin_id    uuid not null references public.admins(id) on delete cascade,
  rows        jsonb not null,     -- validated rows ready to insert
  summary     jsonb not null,     -- { valid, invalid, duplicates }
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '30 minutes'
);
create index question_import_batches_expires_idx on public.question_import_batches (expires_at);
alter table public.question_import_batches enable row level security;
alter table public.question_import_batches force row level security;
revoke all on public.question_import_batches from anon, authenticated;
grant all on public.question_import_batches to service_role;

------------------------------------------------------------------------------- atomic setters
-- Replaces an exam's question list in the given order. Lock trigger blocks this once attempts exist.
create or replace function public.set_exam_questions(p_exam_id uuid, p_question_ids uuid[])
returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_ids   uuid[];
  v_count integer;
begin
  perform 1 from public.exams where id = p_exam_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;

  -- de-duplicate, keeping the first occurrence
  select coalesce(array_agg(id order by ord), '{}') into v_ids
    from (select distinct on (id) id, ord from unnest(coalesce(p_question_ids, '{}')) with ordinality as u(id, ord)
          order by id, ord) d;

  if exists (select 1 from unnest(v_ids) as u(id)
              left join public.questions q on q.id = u.id
              where q.id is null or q.status <> 'active') then
    raise exception 'EXAM_INACTIVE_QUESTIONS' using errcode = 'P0001';
  end if;

  delete from public.exam_questions where exam_id = p_exam_id;
  insert into public.exam_questions (exam_id, question_id, position)
  select p_exam_id, u.id, u.ord::integer from unnest(v_ids) with ordinality as u(id, ord);
  get diagnostics v_count = row_count;
  return v_count;
end $$;

create or replace function public.set_exam_audience(p_exam_id uuid, p_audience public.exam_audience,
                                                    p_student_ids uuid[])
returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_count integer := 0;
begin
  update public.exams set audience = p_audience where id = p_exam_id;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  delete from public.exam_assignees where exam_id = p_exam_id;
  if p_audience = 'selected' then
    insert into public.exam_assignees (exam_id, student_id)
    select distinct p_exam_id, s.id from public.students s where s.id = any (coalesce(p_student_ids, '{}'));
    get diagnostics v_count = row_count;
  end if;
  return v_count;
end $$;

create or replace function public.set_question_tags(p_question_id uuid, p_tag_ids uuid[])
returns void
language sql security definer set search_path = public, pg_temp as $$
  delete from public.question_tags where question_id = p_question_id;
  insert into public.question_tags (question_id, tag_id)
  select distinct p_question_id, t.id from public.tags t where t.id = any (coalesce(p_tag_ids, '{}'));
$$;

------------------------------------------------------------------------------- housekeeping
select cron.schedule('cleanup-import-batches', '*/30 * * * *',
  $$delete from public.question_import_batches where expires_at < now()$$);

do $$
declare
  f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p where p.pronamespace = 'public'::regnamespace loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
