-- 0001 — Extensions, enums, shared trigger function (docs/05_Schema.md §2)

-- Supabase convention: extensions live in the `extensions` schema. Functions that need them pin
-- `search_path = public, extensions, pg_temp` (Decision Log 2026-11-07).
create extension if not exists citext   with schema extensions;
create extension if not exists pg_trgm  with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_cron;
create extension if not exists pg_net   with schema extensions;

create type public.payment_method     as enum ('bkash', 'nagad', 'rocket', 'bank');
create type public.admission_status   as enum ('pending', 'approved', 'rejected');
create type public.admission_kind     as enum ('new', 'renewal');
create type public.student_status     as enum ('active', 'suspended', 'cancelled');
create type public.credentials_status as enum ('pending', 'sent', 'failed');
create type public.difficulty_level   as enum ('easy', 'medium', 'hard');
create type public.question_type      as enum ('knowledge', 'application', 'multi_point');
create type public.content_status     as enum ('draft', 'active', 'archived');
create type public.exam_status        as enum ('draft', 'published', 'archived');
create type public.access_mode        as enum ('fixed', 'window', 'always');
create type public.exam_audience      as enum ('all_active', 'selected');
create type public.option_key         as enum ('A', 'B', 'C', 'D');
create type public.attempt_status     as enum ('in_progress', 'submitted', 'auto_submitted');
create type public.outbox_kind        as enum ('email_renewal', 'email_rejection', 'email_admin_alert',
                                               'sheet_admission_append', 'sheet_admission_update',
                                               'sheet_student_upsert', 'sheet_result_append');
create type public.outbox_status      as enum ('pending', 'processing', 'done', 'failed');
create type public.actor_type         as enum ('admin', 'student', 'system');

create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  new.updated_at := now();
  return new;
end $$;
