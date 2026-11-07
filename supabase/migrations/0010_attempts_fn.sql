-- 0010 — Exam runtime functions (docs/05_Schema.md §8.2, TRD §8). Time is enforced here:
-- answers are accepted until deadline_at + 15 s grace.

-- Per-question option permutation ("CABD" = display order of canonical keys). Volatile so it is
-- evaluated once per row, not once per statement.
create or replace function public.random_option_order() returns text
language sql volatile set search_path = public, pg_temp as $$
  select string_agg(k, '' order by random()) from unnest(array['A', 'B', 'C', 'D']) as k
$$;

create or replace function public.start_attempt(p_exam_id uuid, p_student_id uuid)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_student  public.students;
  v_exam     public.exams;
  v_phase    text;
  v_id       uuid;
  v_order    uuid[];
  v_options  jsonb;
  v_cap      timestamptz;
  v_deadline timestamptz;
begin
  select * into v_student from public.students where id = p_student_id for share;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if public.student_access_state(v_student) <> 'active' then
    raise exception 'ACCESS_INACTIVE' using errcode = 'P0001';
  end if;

  select * into v_exam from public.exams where id = p_exam_id;
  if not found or v_exam.status <> 'published' or v_exam.is_sample
     or not public.student_is_assigned(v_exam, p_student_id) then
    raise exception 'EXAM_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  select id into v_id from public.exam_attempts where exam_id = p_exam_id and student_id = p_student_id;
  if found then
    return v_id;
  end if;

  v_phase := public.exam_phase(v_exam);
  if v_phase = 'scheduled' then
    raise exception 'EXAM_NOT_STARTED' using errcode = 'P0001';
  elsif v_phase not in ('live', 'late_window') or v_exam.question_count = 0 then
    raise exception 'EXAM_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  select array_agg(eq.question_id order by case when v_exam.shuffle_questions then random() else eq.position end)
    into v_order
    from public.exam_questions eq where eq.exam_id = p_exam_id;

  select coalesce(jsonb_object_agg(q, case when v_exam.shuffle_options then public.random_option_order() else 'ABCD' end),
                  '{}'::jsonb)
    into v_options
    from unnest(v_order) as q;

  v_cap := case v_exam.access_mode
             when 'fixed'  then v_exam.live_ends_at
             when 'window' then v_exam.late_until
             else null
           end;
  v_deadline := now() + make_interval(mins => v_exam.duration_minutes);
  if v_cap is not null and v_cap < v_deadline then
    v_deadline := v_cap;
  end if;

  insert into public.exam_attempts (exam_id, student_id, deadline_at, is_late, question_order, option_order)
  values (p_exam_id, p_student_id, v_deadline, now() >= v_exam.live_ends_at, v_order, v_options)
  on conflict (exam_id, student_id) do nothing
  returning id into v_id;

  if v_id is null then  -- lost a concurrent race; return the winner's attempt
    select id into v_id from public.exam_attempts where exam_id = p_exam_id and student_id = p_student_id;
  end if;
  return v_id;
end $$;

-- Applies client changes; a change wins only if its seq is newer than what is stored (TRD ADR-06).
create or replace function public.apply_answer_changes(p_attempt public.exam_attempts, p_changes jsonb)
returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_count integer;
begin
  with incoming as (
    select distinct on (c.q) c.q, c.o, coalesce(c.m, false) as m, c.s
      from jsonb_to_recordset(coalesce(p_changes, '[]'::jsonb)) as c(q uuid, o public.option_key, m boolean, s bigint)
     where c.q = any (p_attempt.question_order) and c.s is not null and c.s >= 1
     order by c.q, c.s desc
  ), upserted as (
    insert into public.attempt_answers as aa (attempt_id, question_id, selected_option, is_marked, client_seq, updated_at)
    select p_attempt.id, i.q, i.o, i.m, i.s, now() from incoming i
    on conflict (attempt_id, question_id) do update
      set selected_option = excluded.selected_option,
          is_marked       = excluded.is_marked,
          client_seq      = excluded.client_seq,
          updated_at      = now()
      where aa.client_seq < excluded.client_seq
    returning 1
  )
  select count(*) into v_count from upserted;
  return v_count;
end $$;

create or replace function public.save_answers(p_attempt_id uuid, p_student_id uuid, p_changes jsonb,
                                               p_last_index integer default null)
returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_attempt public.exam_attempts;
  v_count   integer;
begin
  select * into v_attempt from public.exam_attempts where id = p_attempt_id for update;
  if not found or v_attempt.student_id <> p_student_id then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_attempt.status <> 'in_progress' or now() > v_attempt.deadline_at + interval '15 seconds' then
    raise exception 'ATTEMPT_CLOSED' using errcode = 'P0001';
  end if;

  v_count := public.apply_answer_changes(v_attempt, p_changes);

  if p_last_index is not null then
    update public.exam_attempts set last_question_index = greatest(p_last_index, 0) where id = p_attempt_id;
  end if;
  return v_count;
end $$;

-- Scores an in-progress attempt and finalizes it. Internal: called by submit/finalize only.
create or replace function public.score_attempt(p_attempt_id uuid, p_final public.attempt_status)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_attempt   public.exam_attempts;
  v_exam      public.exams;
  v_correct   integer;
  v_incorrect integer;
  v_total     integer;
  v_first     boolean;
begin
  select * into v_attempt from public.exam_attempts where id = p_attempt_id for update;
  if not found or v_attempt.status <> 'in_progress' then
    return;
  end if;
  select * into v_exam from public.exams where id = v_attempt.exam_id;

  update public.attempt_answers aa
     set is_correct = case when aa.selected_option is null then null else aa.selected_option = q.correct_option end
    from public.questions q
   where q.id = aa.question_id and aa.attempt_id = p_attempt_id;

  select count(*) filter (where is_correct), count(*) filter (where is_correct = false)
    into v_correct, v_incorrect
    from public.attempt_answers where attempt_id = p_attempt_id;
  v_total := coalesce(array_length(v_attempt.question_order, 1), 0);

  -- Approximate under concurrent first submissions; times_used is a statistic only.
  v_first := not exists (select 1 from public.exam_attempts
                          where exam_id = v_attempt.exam_id and status <> 'in_progress');

  update public.exam_attempts
     set status          = p_final,
         submitted_at    = least(now(), deadline_at + interval '15 seconds'),
         score           = round(v_correct * v_exam.marks_per_question - v_incorrect * v_exam.negative_mark, 2),
         correct_count   = v_correct,
         incorrect_count = v_incorrect,
         skipped_count   = v_total - v_correct - v_incorrect
   where id = p_attempt_id;

  update public.questions q
     set times_answered = q.times_answered + 1,
         times_correct  = q.times_correct + case when aa.is_correct then 1 else 0 end
    from public.attempt_answers aa
   where aa.attempt_id = p_attempt_id and aa.question_id = q.id and aa.selected_option is not null;

  if v_first then
    update public.questions set times_used = times_used + 1 where id = any (v_attempt.question_order);
  end if;

  insert into public.outbox (kind, payload, dedupe_key)
  values ('sheet_result_append', jsonb_build_object('attemptId', p_attempt_id), 'sheet_result_append:' || p_attempt_id)
  on conflict (dedupe_key) do nothing;
end $$;

create or replace function public.submit_attempt(p_attempt_id uuid, p_student_id uuid, p_changes jsonb, p_auto boolean)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_attempt public.exam_attempts;
begin
  select * into v_attempt from public.exam_attempts where id = p_attempt_id for update;
  if not found or v_attempt.student_id <> p_student_id then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_attempt.status <> 'in_progress' then
    raise exception 'ATTEMPT_CLOSED' using errcode = 'P0001';
  end if;

  -- Changes after the grace period are ignored (not rejected): the server-saved answers are final.
  if now() <= v_attempt.deadline_at + interval '15 seconds' then
    perform public.apply_answer_changes(v_attempt, p_changes);
  end if;

  perform public.score_attempt(
    p_attempt_id,
    case when p_auto or now() > v_attempt.deadline_at then 'auto_submitted' else 'submitted' end::public.attempt_status);
  return p_attempt_id;
end $$;

create or replace function public.finalize_attempt_if_overdue(p_attempt_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if exists (select 1 from public.exam_attempts
              where id = p_attempt_id and status = 'in_progress'
                and deadline_at + interval '15 seconds' < now()) then
    perform public.score_attempt(p_attempt_id, 'auto_submitted');
  end if;
end $$;

create or replace function public.finalize_overdue_attempts()
returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id    uuid;
  v_count integer := 0;
begin
  for v_id in
    select id from public.exam_attempts
     where status = 'in_progress' and deadline_at + interval '15 seconds' < now()
     order by deadline_at
     limit 500
     for update skip locked
  loop
    perform public.score_attempt(v_id, 'auto_submitted');
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
