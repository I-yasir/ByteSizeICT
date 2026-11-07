-- 0009 — Derived state functions & the answer-free paper view (docs/05_Schema.md §8.1)

create or replace function public.student_access_state(s public.students, at timestamptz default now())
returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when s.status = 'suspended' then 'suspended'
    when s.status = 'cancelled' then 'cancelled'
    when at < s.access_starts_at or at >= s.access_expires_at then 'expired'
    else 'active'
  end
$$;

create or replace function public.exam_phase(e public.exams, at timestamptz default now())
returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when e.status = 'archived' then 'archived'
    when e.status = 'draft' then 'draft'
    when e.is_sample then 'live'
    when at < e.starts_at then 'scheduled'
    when at < e.live_ends_at then 'live'
    when e.access_mode = 'always' then 'late_window'
    when e.access_mode = 'window' and at < e.late_until then 'late_window'
    else 'closed'
  end
$$;

create or replace function public.student_is_assigned(p_exam public.exams, p_student_id uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select p_exam.audience = 'all_active'
      or exists (select 1 from public.exam_assignees a
                 where a.exam_id = p_exam.id and a.student_id = p_student_id)
$$;

-- Cards for /dashboard and /exams (docs/02_AppFlow.md §3.5). Finalizes overdue attempts first.
create or replace function public.student_exam_cards(p_student_id uuid)
returns table (
  exam_id uuid, title text, chapter_label text, starts_at timestamptz, live_ends_at timestamptz,
  late_until timestamptz, access_mode public.access_mode, duration_minutes integer,
  question_count integer, total_marks numeric, negative_mark numeric, phase text, card_status text,
  attempt_id uuid, attempt_status public.attempt_status, score numeric, is_late boolean
)
language plpgsql security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare
  v_student public.students;
  v_access  text;
  v_overdue uuid;
begin
  select * into v_student from public.students s where s.id = p_student_id;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  v_access := public.student_access_state(v_student);

  for v_overdue in
    select a.id from public.exam_attempts a
     where a.student_id = p_student_id and a.status = 'in_progress'
       and a.deadline_at + interval '15 seconds' < now()
  loop
    perform public.finalize_attempt_if_overdue(v_overdue);
  end loop;

  return query
  select e.id, e.title, e.chapter_label, e.starts_at, e.live_ends_at, e.late_until, e.access_mode,
         e.duration_minutes, e.question_count, e.question_count * e.marks_per_question, e.negative_mark,
         public.exam_phase(e),
         case
           when a.status in ('submitted', 'auto_submitted') then 'completed'
           when a.status = 'in_progress' then 'in_progress'
           when v_access <> 'active' then 'locked'
           when public.exam_phase(e) = 'scheduled' then 'upcoming'
           when public.exam_phase(e) = 'live' then 'live'
           when public.exam_phase(e) = 'late_window' then 'missed_available'
           else 'missed'
         end,
         a.id, a.status, a.score, a.is_late
    from public.exams e
    left join public.exam_attempts a on a.exam_id = e.id and a.student_id = p_student_id
   where e.status = 'published' and not e.is_sample and public.student_is_assigned(e, p_student_id)
   order by e.starts_at;
end $$;

-- The only source of question content for in-progress papers (TRD §4.6): no answer key columns.
create view public.paper_questions with (security_invoker = true) as
select id, stem, stem_image_path, option_a, option_a_image_path, option_b, option_b_image_path,
       option_c, option_c_image_path, option_d, option_d_image_path
  from public.questions;
revoke all on public.paper_questions from anon, authenticated;
grant select on public.paper_questions to service_role;
