-- 0008 — Row-Level Security, grants, storage buckets (docs/05_Schema.md §7, TRD ADR-03)
-- The app server uses service_role (BYPASSRLS). `anon` may read only public marketing data.
-- `authenticated` is unused (no Supabase Auth) and gets nothing.

-- 1) Enable + force RLS on every table in public
do $$
declare
  t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
    execute format('alter table public.%I force row level security', t.tablename);
  end loop;
end $$;

-- 2) Revoke everything from client roles, including future objects created by this role
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated, public;
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated, public;

-- The server role keeps full table access
grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- 3) Public read surface (anon only)
grant select on public.plans to anon;
create policy plans_public_read on public.plans for select to anon using (is_active);

grant select on public.payment_accounts to anon;
create policy payment_accounts_public_read on public.payment_accounts for select to anon using (is_active);

grant select (key, value) on public.app_settings to anon;
create policy app_settings_public_read on public.app_settings for select to anon using (is_public);

grant select on public.subjects, public.chapters to anon;
create policy subjects_public_read on public.subjects for select to anon using (true);
create policy chapters_public_read on public.chapters for select to anon using (true);

-- exams: column-level grant (no publish gates, audience or sample internals)
grant select (id, title, description, subject_id, chapter_label, starts_at, live_ends_at, access_mode,
              duration_minutes, marks_per_question, negative_mark, question_count, is_featured)
  on public.exams to anon;
create policy exams_public_routine on public.exams for select to anon
  using (status = 'published' and not is_sample);

-- 4) Every other table has no policy → fully denied to anon/authenticated.

-- 5) Storage buckets. question-media: private, served only via signed URLs from the server.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('question-media', 'question-media', false, 1048576, array['image/png', 'image/jpeg', 'image/webp']),
  ('public-assets',  'public-assets',  true,   524288, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
on conflict (id) do nothing;
-- No storage.objects policies for anon/authenticated: public-assets is read through its public URL,
-- and all writes go through service_role.
