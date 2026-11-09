-- R1.1 plan routines (0017, docs/05_Schema.md §7): public PDF bucket, anon reads the path, no anon writes.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(9);

select has_column('public', 'plans', 'routine_pdf_path', 'plans have a routine PDF path');
select is((select public from storage.buckets where id = 'plan-routines'), true, 'plan-routines is public');
select is((select file_size_limit from storage.buckets where id = 'plan-routines'), 5242880::bigint, 'plan-routines is limited to 5 MB');
select is((select allowed_mime_types from storage.buckets where id = 'plan-routines'), array['application/pdf'], 'plan-routines accepts PDFs only');

insert into plans (code, name_bn, name_en, duration_days, price_bdt, is_active, routine_pdf_path)
values ('t-routine', 'রুটিন', 'Routine', 30, 100, true, 'plans/00000000-0000-4000-8000-0000000000aa.pdf');
select throws_ok($$update plans set routine_pdf_path = 'elsewhere/x.pdf' where code = 't-routine'$$, '23514', null, 'the path must be plans/<uuid>.pdf');

set local role anon;
select is((select routine_pdf_path from plans where code = 't-routine'), 'plans/00000000-0000-4000-8000-0000000000aa.pdf',
          'anon reads the routine path of an active plan');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('plan-routines', 'plans/evil.pdf')$$, '42501', null,
                 'anon cannot upload to plan-routines');
select is((select count(*)::int from storage.objects where bucket_id = 'plan-routines' and name = 'plans/evil.pdf'), 0, 'nothing was written');
select throws_ok($$update plans set routine_pdf_path = null where code = 't-routine'$$, '42501', null, 'anon cannot change plans');
reset role;

select * from finish();
rollback;
