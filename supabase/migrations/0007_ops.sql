-- 0007 — Audit log (append-only) & transactional outbox (docs/05_Schema.md §6)

create table public.audit_log (
  id                bigint generated always as identity primary key,
  actor_type        public.actor_type not null,
  actor_admin_id    uuid references public.admins(id)   on delete set null,
  actor_student_id  uuid references public.students(id) on delete set null,
  action            text not null,
  entity_type       text not null check (entity_type in ('admission', 'student', 'exam', 'question', 'setting',
                                                         'plan', 'payment_account', 'session')),
  entity_id         text,
  before            jsonb,
  after             jsonb,
  meta              jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);
create index audit_entity_idx  on public.audit_log (entity_type, entity_id, created_at desc);
create index audit_created_idx on public.audit_log (created_at desc);
create index audit_action_idx  on public.audit_log (action, created_at desc);

create or replace function public.audit_log_immutable() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  -- The only permitted change: ON DELETE SET NULL of an actor reference (deleting an admin/student).
  if tg_op = 'UPDATE'
     and (new.actor_admin_id is null or new.actor_admin_id = old.actor_admin_id)
     and (new.actor_student_id is null or new.actor_student_id = old.actor_student_id)
     and (new.id, new.actor_type, new.action, new.entity_type, new.entity_id, new.before, new.after, new.meta, new.created_at)
         is not distinct from
         (old.id, old.actor_type, old.action, old.entity_type, old.entity_id, old.before, old.after, old.meta, old.created_at)
  then
    return new;
  end if;
  raise exception 'AUDIT_LOG_IMMUTABLE' using errcode = 'P0001';
end $$;
create trigger audit_log_no_update
  before update or delete on public.audit_log
  for each row execute function public.audit_log_immutable();

create table public.outbox (
  id               bigint generated always as identity primary key,
  kind             public.outbox_kind not null,
  payload          jsonb not null,           -- NEVER contains PINs, passwords or tokens
  dedupe_key       text unique,
  status           public.outbox_status not null default 'pending',
  attempts         smallint not null default 0,
  max_attempts     smallint not null default 8,
  next_attempt_at  timestamptz not null default now(),
  locked_at        timestamptz,
  last_error       text,
  created_at       timestamptz not null default now(),
  done_at          timestamptz
);
create index outbox_ready_idx on public.outbox (next_attempt_at, id) where status in ('pending', 'processing');
