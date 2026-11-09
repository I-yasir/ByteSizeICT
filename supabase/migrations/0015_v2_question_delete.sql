-- 0015 — R1.1 (CR2, Plan V2.10): question deletion (docs/05_Schema.md §5, §8.7; AppFlow §6.5; PRD A-17).
-- D3: a question in a current or upcoming exam (phase draft / scheduled / live / late_window) cannot be
-- deleted. Otherwise it is soft-deleted when any exam or answer references it (past exams keep their
-- results and reviews) and hard-deleted when nothing does.

alter table public.questions
  add column deleted_at timestamptz,
  add column deleted_by uuid references public.admins(id) on delete set null;

-- The bank, builder and duplicate checks only ever look at live (not deleted) questions.
create index questions_live_idx on public.questions (chapter_id, status) where deleted_at is null;
create index questions_live_hash_idx on public.questions (content_hash) where deleted_at is null;

create or replace function public.delete_questions(p_admin uuid, p_ids uuid[])
returns table (question_id uuid, mode text, image_paths text[])
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_blocking jsonb;
  q          public.questions%rowtype;
  v_used     boolean;
begin
  if p_admin is null or coalesce(cardinality(p_ids), 0) = 0 then
    raise exception 'VALIDATION' using errcode = 'P0001';
  end if;

  -- Lock the questions first so a concurrent set_exam_questions cannot slip one into an exam.
  perform 1 from public.questions where id = any (p_ids) for update;

  select jsonb_agg(distinct jsonb_build_object('id', e.id, 'title', e.title, 'phase', public.exam_phase(e)))
    into v_blocking
    from public.exam_questions eq
    join public.exams e on e.id = eq.exam_id
   where eq.question_id = any (p_ids)
     and public.exam_phase(e) in ('draft', 'scheduled', 'live', 'late_window');
  if v_blocking is not null then
    raise exception 'QUESTION_IN_USE' using errcode = 'P0001', detail = v_blocking::text;
  end if;

  for q in select * from public.questions where id = any (p_ids) and deleted_at is null order by id loop
    v_used := exists (select 1 from public.exam_questions where exam_questions.question_id = q.id)
           or exists (select 1 from public.attempt_answers where attempt_answers.question_id = q.id);
    if v_used then
      update public.questions set deleted_at = now(), deleted_by = p_admin where id = q.id;
      mode := 'soft';
      image_paths := '{}';
    else
      delete from public.questions where id = q.id;
      mode := 'hard';
      -- Duplicated questions share image paths: only hand back files no remaining row points at.
      image_paths := array(
        select p from unnest(array[q.stem_image_path, q.option_a_image_path, q.option_b_image_path,
                                   q.option_c_image_path, q.option_d_image_path, q.explanation_image_path]) as p
         where p is not null
           and not exists (select 1 from public.questions o
                            where p in (o.stem_image_path, o.option_a_image_path, o.option_b_image_path,
                                        o.option_c_image_path, o.option_d_image_path, o.explanation_image_path)));
    end if;
    perform public.log_audit_admin(p_admin, 'question.delete', 'question', q.id::text, to_jsonb(q), null,
                                   jsonb_build_object('mode', mode));
    question_id := q.id;
    return next;
  end loop;
end $$;

-- set_exam_questions (0013) now also rejects deleted questions.
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
              where q.id is null or q.status <> 'active' or q.deleted_at is not null) then
    raise exception 'EXAM_INACTIVE_QUESTIONS' using errcode = 'P0001';
  end if;

  delete from public.exam_questions where exam_id = p_exam_id;
  insert into public.exam_questions (exam_id, question_id, position)
  select p_exam_id, u.id, u.ord::integer from unnest(v_ids) with ordinality as u(id, ord);
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke all on function public.delete_questions(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.delete_questions(uuid, uuid[]) to service_role;
revoke all on function public.set_exam_questions(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.set_exam_questions(uuid, uuid[]) to service_role;
