-- 0018 — R1.1 (CR1, Plan V2.24): exam audiences by plan (docs/05_Schema.md §3–§5, §8.1, §8.6; D1/D2).
-- Destructive by design (D10/D11): the "selected students" audience and exam_assignees are removed;
-- existing `selected` exams become `all_active`.

-- 1) Swap the enum: Postgres can't drop an enum value, so a new type replaces the old one.
alter type public.exam_audience rename to exam_audience_r1;
create type public.exam_audience as enum ('all_active', 'plans');

drop function if exists public.set_exam_audience(uuid, public.exam_audience_r1, uuid[]);

alter table public.exams alter column audience drop default;
alter table public.exams
  alter column audience type public.exam_audience using 'all_active'::public.exam_audience;
alter table public.exams alter column audience set default 'all_active';

drop type public.exam_audience_r1;

-- 2) Plans as audiences. RESTRICT on plans: plans are only ever deactivated, never deleted.
create table public.exam_audience_plans (
  exam_id  uuid not null references public.exams(id) on delete cascade,
  plan_id  uuid not null references public.plans(id) on delete restrict,
  primary key (exam_id, plan_id)
);
create index exam_audience_plans_plan_idx on public.exam_audience_plans (plan_id);
alter table public.exam_audience_plans enable row level security;
alter table public.exam_audience_plans force row level security;
revoke all on public.exam_audience_plans from anon, authenticated;
grant all on public.exam_audience_plans to service_role;

drop table public.exam_assignees;

-- 3) Visibility. A student without a plan (legacy/admin-created) sees only all_active exams.
--    student_exam_cards and start_attempt call this, so they pick up the rule unchanged.
create or replace function public.student_is_assigned(p_exam public.exams, p_student_id uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select p_exam.audience = 'all_active'
      or exists (select 1
                   from public.exam_audience_plans ap
                   join public.students s on s.plan_id = ap.plan_id
                  where ap.exam_id = p_exam.id and s.id = p_student_id)
$$;

-- Replaces the exam's plan list (existing plans only; inactive plans may stay targeted so their
-- remaining students keep access). Returns the number of plans stored.
create or replace function public.set_exam_audience(p_exam_id uuid, p_audience public.exam_audience, p_plan_ids uuid[])
returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_count integer := 0;
begin
  update public.exams set audience = p_audience where id = p_exam_id;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  delete from public.exam_audience_plans where exam_id = p_exam_id;
  if p_audience = 'plans' then
    insert into public.exam_audience_plans (exam_id, plan_id)
    select distinct p_exam_id, p.id from public.plans p where p.id = any (coalesce(p_plan_ids, '{}'));
    get diagnostics v_count = row_count;
  end if;
  return v_count;
end $$;

revoke all on function public.student_is_assigned(public.exams, uuid) from public, anon, authenticated;
grant execute on function public.student_is_assigned(public.exams, uuid) to service_role;
revoke all on function public.set_exam_audience(uuid, public.exam_audience, uuid[]) from public, anon, authenticated;
grant execute on function public.set_exam_audience(uuid, public.exam_audience, uuid[]) to service_role;
