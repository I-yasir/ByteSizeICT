-- 0011 — Results, admissions, student admin ops, sessions, audit, outbox (docs/05_Schema.md §8.3–8.4)

------------------------------------------------------------------------------- audit & sessions
create or replace function public.log_audit(p_actor public.actor_type, p_action text, p_entity_type text,
                                            p_entity_id text default null, p_admin uuid default null,
                                            p_student uuid default null, p_before jsonb default null,
                                            p_after jsonb default null, p_meta jsonb default '{}'::jsonb)
returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into public.audit_log (actor_type, actor_admin_id, actor_student_id, action, entity_type, entity_id,
                                before, after, meta)
  values (p_actor, p_admin, p_student, p_action, p_entity_type, p_entity_id, p_before, p_after,
          coalesce(p_meta, '{}'::jsonb))
$$;

-- Shorthand used by the admin SQL functions below.
create or replace function public.log_audit_admin(p_admin uuid, p_action text, p_entity_type text, p_entity_id text,
                                                  p_before jsonb default null, p_after jsonb default null,
                                                  p_meta jsonb default '{}'::jsonb)
returns void
language sql security definer set search_path = public, pg_temp as $$
  select public.log_audit('admin', p_action, p_entity_type, p_entity_id, p_admin, null, p_before, p_after, p_meta)
$$;

-- Revokes the active sessions of one student OR one admin, optionally keeping one session.
create or replace function public.revoke_sessions(p_reason text, p_student_id uuid default null,
                                                  p_admin_id uuid default null, p_except_session uuid default null)
returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_count integer;
begin
  if (p_student_id is null) = (p_admin_id is null) then
    raise exception 'VALIDATION' using errcode = 'P0001';
  end if;
  update public.sessions
     set revoked_at = now(), revoke_reason = p_reason
   where revoked_at is null
     and (student_id = p_student_id or admin_id = p_admin_id)
     and (p_except_session is null or id <> p_except_session);
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Single-session policy (TRD §6.2): keep the newest p_max active sessions, revoke the rest.
create or replace function public.enforce_session_limit(p_student_id uuid, p_max integer)
returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_count integer;
begin
  update public.sessions
     set revoked_at = now(), revoke_reason = 'new_login'
   where id in (select id from public.sessions
                 where student_id = p_student_id and revoked_at is null and expires_at > now()
                 order by created_at desc
                 offset greatest(p_max, 1));
  get diagnostics v_count = row_count;
  return v_count;
end $$;

------------------------------------------------------------------------------- results
create or replace function public.attempt_rank(p_attempt_id uuid)
returns table (rank_position integer, participants integer, highest numeric)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_attempt public.exam_attempts;
  v_exam    public.exams;
begin
  select * into v_attempt from public.exam_attempts where id = p_attempt_id;
  if not found or v_attempt.status = 'in_progress' then
    return;
  end if;
  select * into v_exam from public.exams where id = v_attempt.exam_id;

  return query
  with ranked as (
    select a.score from public.exam_attempts a
     where a.exam_id = v_attempt.exam_id and a.status <> 'in_progress'
       and (v_exam.rank_late_attempts or not a.is_late)
  )
  select case when v_exam.rank_late_attempts or not v_attempt.is_late
              then (1 + (select count(*) from ranked r where r.score > v_attempt.score))::integer
         end,
         (select count(*) from ranked)::integer,
         (select max(r.score) from ranked r);
end $$;

create or replace function public.exam_question_stats(p_exam_id uuid)
returns table (question_id uuid, total integer, a integer, b integer, c integer, d integer, skipped integer,
               correct_pct numeric)
language sql stable security definer set search_path = public, pg_temp as $$
  with fin as (
    select id from public.exam_attempts where exam_id = p_exam_id and status <> 'in_progress'
  ), tot as (
    select count(*)::integer as n from fin
  )
  select eq.question_id,
         tot.n,
         (count(aa.selected_option) filter (where aa.selected_option = 'A'))::integer,
         (count(aa.selected_option) filter (where aa.selected_option = 'B'))::integer,
         (count(aa.selected_option) filter (where aa.selected_option = 'C'))::integer,
         (count(aa.selected_option) filter (where aa.selected_option = 'D'))::integer,
         (tot.n - count(aa.selected_option))::integer,
         case when tot.n = 0 then 0
              else round(100.0 * count(aa.selected_option) filter (where aa.is_correct) / tot.n, 1) end
    from public.exam_questions eq
   cross join tot
    left join public.attempt_answers aa
      on aa.question_id = eq.question_id and aa.attempt_id in (select id from fin)
   where eq.exam_id = p_exam_id
   group by eq.question_id, eq.position, tot.n
   order by eq.position
$$;

create or replace function public.exam_summary(p_exam_id uuid)
returns table (participants integer, late_participants integer, avg_score numeric, max_score numeric,
               min_score numeric)
language sql stable security definer set search_path = public, pg_temp as $$
  select count(*)::integer,
         (count(*) filter (where is_late))::integer,
         round(avg(score), 2),
         max(score),
         min(score)
    from public.exam_attempts
   where exam_id = p_exam_id and status <> 'in_progress'
$$;

------------------------------------------------------------------------------- admissions
create or replace function public.submit_admission(p_mobile text, p_email extensions.citext,
                                                   p_method public.payment_method, p_trx text, p_plan_id uuid,
                                                   p_ip inet)
returns uuid
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_student_id  uuid;
  v_amount      integer;
  v_mobiles     text[];
  v_id          uuid;
  v_constraint  text;
begin
  if p_plan_id is not null then
    select price_bdt into v_amount from public.plans where id = p_plan_id and is_active;
    if not found then
      raise exception 'VALIDATION' using errcode = 'P0001';
    end if;
  end if;

  select id into v_student_id from public.students where mobile = p_mobile;
  select coalesce(array_agg(mobile order by mobile), '{}') into v_mobiles
    from public.students where email = p_email and mobile <> p_mobile;

  begin
    insert into public.admissions (kind, mobile, email, payment_method, trx_id, plan_id, amount_bdt,
                                   duplicate_flags, submitter_ip)
    values (case when v_student_id is null then 'new' else 'renewal' end::public.admission_kind,
            p_mobile, p_email, p_method, p_trx, p_plan_id, v_amount,
            jsonb_build_object('mobile_exists', v_student_id is not null,
                               'email_student_mobiles', to_jsonb(v_mobiles)),
            p_ip)
    returning id into v_id;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'admissions_trx_unique_idx' then
      raise exception 'TRX_DUPLICATE' using errcode = 'P0001';
    elsif v_constraint = 'admissions_one_pending_mobile' then
      raise exception 'PENDING_EXISTS' using errcode = 'P0001';
    end if;
    raise;
  end;

  insert into public.outbox (kind, payload, dedupe_key) values
    ('sheet_admission_append', jsonb_build_object('admissionId', v_id), 'sheet_admission_append:' || v_id),
    ('email_admin_alert',      jsonb_build_object('admissionId', v_id), 'email_admin_alert:' || v_id);
  return v_id;
end $$;

create or replace function public.approve_admission(p_admission_id uuid, p_admin_id uuid, p_plan_id uuid,
                                                    p_amount_bdt integer, p_starts_at timestamptz,
                                                    p_expires_at timestamptz, p_pin_hash text, p_note text)
returns table (student_id uuid, kind public.admission_kind, email extensions.citext, mobile text)
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
#variable_conflict use_column
declare
  v_adm     public.admissions;
  v_student public.students;
  v_kind    public.admission_kind;
  v_sid     uuid;
  v_before  jsonb;
  v_state   text;
begin
  select * into v_adm from public.admissions a where a.id = p_admission_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_adm.status <> 'pending' then
    raise exception 'ADMISSION_NOT_PENDING' using errcode = 'P0001';
  end if;
  if p_expires_at is null or p_starts_at is null or p_expires_at <= p_starts_at then
    raise exception 'VALIDATION' using errcode = 'P0001';
  end if;

  -- Decided now, not at submit time: the student may have been created since (renewal wins).
  select * into v_student from public.students s where s.mobile = v_adm.mobile for update;

  if not found then
    if p_pin_hash is null or p_pin_hash = '' then
      raise exception 'VALIDATION' using errcode = 'P0001';
    end if;
    v_kind := 'new';
    insert into public.students (mobile, email, pin_hash, must_change_pin, access_starts_at, access_expires_at,
                                 plan_id, credentials_status)
    values (v_adm.mobile, v_adm.email, p_pin_hash, true, p_starts_at, p_expires_at,
            coalesce(p_plan_id, v_adm.plan_id), 'pending')
    returning id into v_sid;
    perform public.log_audit_admin(p_admin_id, 'admission.approve', 'admission', p_admission_id::text, null,
      jsonb_build_object('studentId', v_sid, 'kind', 'new', 'accessStartsAt', p_starts_at,
                         'accessExpiresAt', p_expires_at, 'amountBdt', p_amount_bdt));
  else
    v_kind := 'renewal';
    v_sid := v_student.id;
    v_state := public.student_access_state(v_student);
    v_before := jsonb_build_object('status', v_student.status, 'accessStartsAt', v_student.access_starts_at,
                                   'accessExpiresAt', v_student.access_expires_at);
    if v_state not in ('expired', 'cancelled') and p_expires_at <= v_student.access_starts_at then
      raise exception 'VALIDATION' using errcode = 'P0001';
    end if;
    update public.students s
       set access_starts_at  = case when v_state in ('expired', 'cancelled') then p_starts_at else s.access_starts_at end,
           access_expires_at = p_expires_at,
           status            = case when s.status = 'cancelled' then 'active'::public.student_status else s.status end,
           status_changed_at = case when s.status = 'cancelled' then now() else s.status_changed_at end,
           plan_id           = coalesce(p_plan_id, v_adm.plan_id, s.plan_id),
           email             = v_adm.email
     where s.id = v_sid;
    perform public.log_audit_admin(p_admin_id, 'admission.approve', 'admission', p_admission_id::text,
      v_before,
      (select jsonb_build_object('studentId', s.id, 'kind', 'renewal', 'status', s.status,
                                 'accessStartsAt', s.access_starts_at, 'accessExpiresAt', s.access_expires_at,
                                 'amountBdt', p_amount_bdt)
         from public.students s where s.id = v_sid));
  end if;

  update public.admissions a
     set status = 'approved', kind = v_kind, reviewed_by = p_admin_id, reviewed_at = now(), student_id = v_sid,
         plan_id = coalesce(p_plan_id, a.plan_id), amount_bdt = p_amount_bdt, review_note = p_note
   where a.id = p_admission_id;

  insert into public.outbox (kind, payload, dedupe_key) values
    ('sheet_admission_update', jsonb_build_object('admissionId', p_admission_id), null),
    ('sheet_student_upsert',   jsonb_build_object('studentId', v_sid), null);
  if v_kind = 'renewal' then
    insert into public.outbox (kind, payload, dedupe_key)
    values ('email_renewal', jsonb_build_object('studentId', v_sid, 'admissionId', p_admission_id),
            'email_renewal:' || p_admission_id);
  end if;

  return query select v_sid, v_kind, v_adm.email, v_adm.mobile;
end $$;

create or replace function public.reject_admission(p_admission_id uuid, p_admin_id uuid, p_reason text,
                                                   p_send_email boolean)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_adm public.admissions;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'VALIDATION' using errcode = 'P0001';
  end if;
  select * into v_adm from public.admissions where id = p_admission_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_adm.status <> 'pending' then
    raise exception 'ADMISSION_NOT_PENDING' using errcode = 'P0001';
  end if;

  update public.admissions
     set status = 'rejected', reviewed_by = p_admin_id, reviewed_at = now(), reject_reason = btrim(p_reason)
   where id = p_admission_id;
  perform public.log_audit_admin(p_admin_id, 'admission.reject', 'admission', p_admission_id::text,
                           null, jsonb_build_object('reason', btrim(p_reason), 'sendEmail', p_send_email));

  insert into public.outbox (kind, payload, dedupe_key)
  values ('sheet_admission_update', jsonb_build_object('admissionId', p_admission_id), null);
  if p_send_email then
    insert into public.outbox (kind, payload, dedupe_key)
    values ('email_rejection', jsonb_build_object('admissionId', p_admission_id), 'email_rejection:' || p_admission_id);
  end if;
end $$;

------------------------------------------------------------------------------- student admin ops
create or replace function public.admin_update_student_access(p_admin_id uuid, p_student_ids uuid[], p_op text,
                                                              p_days integer, p_expires_at timestamptz,
                                                              p_reason text)
returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_student public.students;
  v_after   public.students;
  v_count   integer := 0;
  v_action  text;
begin
  v_action := case p_op
                when 'extend'     then 'student.extend'
                when 'set_expiry' then 'student.set_expiry'
                when 'cancel'     then 'student.cancel'
                when 'suspend'    then 'student.suspend'
                when 'reactivate' then 'student.reactivate'
              end;
  if v_action is null or coalesce(array_length(p_student_ids, 1), 0) = 0
     or (p_op = 'extend' and (p_days is null or p_days not between 1 and 3650))
     or (p_op = 'set_expiry' and p_expires_at is null) then
    raise exception 'VALIDATION' using errcode = 'P0001';
  end if;

  for v_student in
    select * from public.students where id = any (p_student_ids) order by id for update
  loop
    if p_op = 'extend' then
      update public.students
         set access_expires_at = greatest(access_expires_at, now()) + make_interval(days => p_days)
       where id = v_student.id;
    elsif p_op = 'set_expiry' then
      if p_expires_at <= v_student.access_starts_at then
        raise exception 'VALIDATION' using errcode = 'P0001';
      end if;
      update public.students set access_expires_at = p_expires_at where id = v_student.id;
    elsif p_op in ('cancel', 'suspend') then
      update public.students
         set status = (case when p_op = 'cancel' then 'cancelled' else 'suspended' end)::public.student_status,
             status_reason = p_reason, status_changed_at = now()
       where id = v_student.id;
      perform public.revoke_sessions(case when p_op = 'cancel' then 'admin_cancel' else 'admin_suspend' end, v_student.id);
    else -- reactivate
      update public.students
         set status = 'active', status_reason = p_reason, status_changed_at = now()
       where id = v_student.id;
    end if;

    select * into v_after from public.students where id = v_student.id;
    perform public.log_audit_admin(p_admin_id, v_action, 'student', v_student.id::text,
      jsonb_build_object('status', v_student.status, 'accessExpiresAt', v_student.access_expires_at),
      jsonb_build_object('status', v_after.status, 'accessExpiresAt', v_after.access_expires_at),
      jsonb_strip_nulls(jsonb_build_object('reason', p_reason, 'days', p_days)));
    insert into public.outbox (kind, payload) values ('sheet_student_upsert', jsonb_build_object('studentId', v_student.id));
    v_count := v_count + 1;
  end loop;

  if v_count <> array_length(p_student_ids, 1) then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  return v_count;
end $$;

create or replace function public.admin_set_student_pin(p_admin_id uuid, p_student_id uuid, p_pin_hash text,
                                                        p_action text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_action not in ('student.pin_reset', 'student.credentials_resend') or coalesce(p_pin_hash, '') = '' then
    raise exception 'VALIDATION' using errcode = 'P0001';
  end if;
  update public.students
     set pin_hash = p_pin_hash, must_change_pin = true, pin_updated_at = now(), credentials_status = 'pending'
   where id = p_student_id;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  perform public.revoke_sessions('admin_pin_reset', p_student_id);
  perform public.log_audit_admin(p_admin_id, p_action, 'student', p_student_id::text, null, null);
end $$;

------------------------------------------------------------------------------- outbox
create or replace function public.claim_outbox(p_limit integer, p_kinds public.outbox_kind[] default null)
returns setof public.outbox
language sql security definer set search_path = public, pg_temp as $$
  update public.outbox o
     set status = 'processing', locked_at = now(), attempts = o.attempts + 1
   where o.id in (
     select id from public.outbox
      where ((status = 'pending' and next_attempt_at <= now())
             or (status = 'processing' and locked_at < now() - interval '5 minutes'))
        and (p_kinds is null or kind = any (p_kinds))
      order by id
      limit greatest(p_limit, 1)
      for update skip locked)
  returning o.*
$$;

create or replace function public.complete_outbox(p_id bigint, p_ok boolean, p_error text default null)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_ok then
    update public.outbox
       set status = 'done', done_at = now(), locked_at = null, last_error = null
     where id = p_id;
  else
    update public.outbox
       set status = case when attempts >= max_attempts then 'failed' else 'pending' end::public.outbox_status,
           locked_at = null,
           last_error = left(p_error, 2000),
           next_attempt_at = now() + ((array['1 minute', '5 minutes', '15 minutes', '1 hour', '3 hours',
                                             '6 hours', '12 hours', '24 hours'])[least(greatest(attempts, 1), 8)])::interval
     where id = p_id;
  end if;
end $$;

------------------------------------------------------------------------------- privileges
-- Every function in public: no EXECUTE for client roles; service_role only (docs/05_Schema.md §7).
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
