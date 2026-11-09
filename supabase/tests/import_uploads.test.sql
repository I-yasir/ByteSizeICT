-- R1.1 import uploads (0016, docs/05_Schema.md §7, §8.5): private bucket, batch columns, stale-file lookup.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(12);

select is((select public from storage.buckets where id = 'import-uploads'), false, 'import-uploads is private');
select is((select file_size_limit from storage.buckets where id = 'import-uploads'), 20971520::bigint, 'import-uploads is limited to 20 MB');
select ok(not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                       and (roles && array['anon', 'authenticated', 'public']::name[])),
          'no storage.objects policy grants anon/authenticated anything');
select has_column('public', 'question_import_batches', 'images', 'batches record staged images');
select has_column('public', 'question_import_batches', 'staged_paths', 'batches record staged paths');
select ok(not has_function_privilege('anon', 'public.stale_import_uploads(interval, integer)', 'execute')
          and not has_function_privilege('authenticated', 'public.stale_import_uploads(interval, integer)', 'execute'),
          'stale_import_uploads is not callable by anon/authenticated');
select ok(exists (select 1 from cron.job where jobname = 'import-cleanup-kick'), 'hourly cleanup kick is scheduled');

insert into storage.objects (bucket_id, name, created_at) values
  ('import-uploads', 'test-old/rows.json',                          now() - interval '25 hours'),
  ('import-uploads', 'test-new/rows.json',                          now() - interval '1 hour'),
  ('question-media', 'staging/test-old/2-stem_image.png',           now() - interval '25 hours'),
  ('question-media', 'questions/00000000-0000-4000-8000-00000000f001.png', now() - interval '25 hours');

create temp table t_stale as select * from stale_import_uploads(interval '24 hours') where name like '%test-%' or name like 'questions/00000000-0000-4000-8000-00000000f001%';
select ok(exists (select 1 from t_stale where bucket_id = 'import-uploads' and name = 'test-old/rows.json'), 'an old rows JSON is stale');
select ok(exists (select 1 from t_stale where bucket_id = 'question-media' and name = 'staging/test-old/2-stem_image.png'), 'an old staged image is stale');
select ok(not exists (select 1 from t_stale where name = 'test-new/rows.json'), 'a recent upload is kept');
select ok(not exists (select 1 from t_stale where name like 'questions/%'), 'question images are never cleanup candidates');
select is((select count(*)::int from stale_import_uploads(interval '24 hours', 1)), 1, 'the limit is respected');

select * from finish();
rollback;
