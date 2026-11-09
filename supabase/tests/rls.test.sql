-- RLS & grants (docs/05_Schema.md §7). Fixtures are created here; seed.sql is not relied on.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(21);

-- Fixtures (as postgres)
insert into plans (code, name_bn, name_en, duration_days, price_bdt, is_active)
values ('t-active', 'সক্রিয়', 'Active', 30, 500, true), ('t-inactive', 'নিষ্ক্রিয়', 'Inactive', 30, 500, false);
insert into app_settings (key, value, is_public) values
  ('brand', '{"name":"T"}', true), ('auth', '{"maxDevices":1}', false)
on conflict (key) do update set value = excluded.value, is_public = excluded.is_public;
update exams set status = 'archived' where is_sample;  -- park the seeded sample exam, if any
insert into exams (id, title, status, starts_at, live_ends_at, is_sample) values
  ('00000000-0000-4000-8000-00000000e001', 'Published', 'published', now() + interval '1 day', now() + interval '1 day 1 hour', false),
  ('00000000-0000-4000-8000-00000000e002', 'Draft', 'draft', null, null, false),
  ('00000000-0000-4000-8000-00000000e003', 'Sample', 'published', null, null, true);

select is(
  (select count(*)::int from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
     and not (c.relrowsecurity and c.relforcerowsecurity)),
  0, 'rls_enabled_on_all_tables: every public table has RLS enabled and forced');

select is(
  (select count(*)::int from pg_proc p where p.pronamespace = 'public'::regnamespace
     and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))),
  0, 'no public function is executable by anon/authenticated');

select is(
  (select count(*)::int from pg_proc p where p.pronamespace = 'public'::regnamespace
     and not has_function_privilege('service_role', p.oid, 'execute')),
  0, 'service_role can execute every public function');

set local role anon;

select throws_ok('select * from questions',       '42501', null, 'anon cannot read questions');
select throws_ok('select * from students',        '42501', null, 'anon cannot read students');
select throws_ok('select * from admissions',      '42501', null, 'anon cannot read admissions');
select throws_ok('select * from exam_attempts',   '42501', null, 'anon cannot read exam_attempts');
select throws_ok('select * from attempt_answers', '42501', null, 'anon cannot read attempt_answers');
select throws_ok('select * from sessions',        '42501', null, 'anon cannot read sessions');
select throws_ok('select * from paper_questions', '42501', null, 'anon cannot read paper_questions');
select throws_ok('select * from outbox',          '42501', null, 'anon cannot read outbox');
select throws_ok($$insert into plans (code, name_bn, name_en, duration_days, price_bdt) values ('x', 'x', 'x', 1, 1)$$,
                 '42501', null, 'anon cannot write plans');

select is((select array_agg(code order by code) from plans where code like 't-%'), array['t-active'], 'anon sees only active plans');
select is((select count(*)::int from app_settings where key in ('auth', 'results')), 0, 'anon sees only public settings');
-- R1.1 (0019): exams are not public at all, not even published ones.
select throws_ok('select id, title, starts_at from exams', '42501', null, 'anon cannot read exams (R1.1)');
select throws_ok('select answers_publish_at from exams', '42501', null, 'anon cannot read non-granted exam columns');
select throws_ok('select * from exams', '42501', null, 'anon cannot select * from exams');
select throws_ok($$select public.start_attempt('00000000-0000-4000-8000-00000000e001', gen_random_uuid())$$,
                 '42501', null, 'anon cannot execute start_attempt');
select throws_ok('select public.finalize_overdue_attempts()', '42501', null, 'anon cannot execute finalize_overdue_attempts');

reset role;
select ok(not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'exams' and policyname = 'exams_public_routine'),
          'the public routine policy is gone');
select hasnt_column('public', 'exams', 'is_featured', 'is_featured dropped (D5)');
select * from finish();
rollback;
