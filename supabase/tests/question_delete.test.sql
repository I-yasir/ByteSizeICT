-- R1.1 question deletion (0015, docs/05_Schema.md §8.7, decision D3).
-- q1–q4 sit in current/upcoming exams (blocked); q5 was answered in a closed exam and q7 is in an
-- archived exam (soft delete); q6 was never used and has images (hard delete), one shared with q8.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(19);

insert into admins (id, email, display_name, password_hash) values ('00000000-0000-4000-8000-0000000000d1', 'del@t.test', 'Del', 'x');
insert into subjects (id, slug, name_bn, name_en) values ('00000000-0000-4000-8000-0000000000a1', 't-del', 'ডিলিট', 'Delete');
insert into chapters (id, subject_id, number, name_bn, name_en)
values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a1', 1, 'অধ্যায়', 'Chapter');
insert into questions (id, chapter_id, stem, option_a, option_b, option_c, option_d, correct_option, status, stem_image_path, option_b_image_path, explanation_image_path) values
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-0000000000c1', 'D1', 'a', 'b', 'c', 'd', 'A', 'active', null, null, null),
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-0000000000c1', 'D2', 'a', 'b', 'c', 'd', 'A', 'active', null, null, null),
  ('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-0000000000c1', 'D3', 'a', 'b', 'c', 'd', 'A', 'active', null, null, null),
  ('00000000-0000-4000-8000-000000000104', '00000000-0000-4000-8000-0000000000c1', 'D4', 'a', 'b', 'c', 'd', 'A', 'active', null, null, null),
  ('00000000-0000-4000-8000-000000000105', '00000000-0000-4000-8000-0000000000c1', 'D5', 'a', 'b', 'c', 'd', 'A', 'active', null, null, null),
  ('00000000-0000-4000-8000-000000000106', '00000000-0000-4000-8000-0000000000c1', 'D6', 'a', 'b', 'c', 'd', 'A', 'active',
   'questions/00000000-0000-4000-8000-0000000006a1.png', 'questions/00000000-0000-4000-8000-0000000006b1.webp',
   'questions/00000000-0000-4000-8000-0000000006c1.png'),
  ('00000000-0000-4000-8000-000000000107', '00000000-0000-4000-8000-0000000000c1', 'D7', 'a', 'b', 'c', 'd', 'A', 'active', null, null, null),
  ('00000000-0000-4000-8000-000000000108', '00000000-0000-4000-8000-0000000000c1', 'D8', 'a', 'b', 'c', 'd', 'A', 'draft', null, null,
   'questions/00000000-0000-4000-8000-0000000006c1.png');
insert into students (id, mobile, email, pin_hash, access_starts_at, access_expires_at) values
  ('00000000-0000-4000-8000-0000000005d1', '01990000501', 'd@t.test', 'x', now() - interval '1 day', now() + interval '30 days');

insert into exams (id, title, status, starts_at, live_ends_at, access_mode) values
  ('00000000-0000-4000-8000-00000000d001', 'Draft exam',     'draft',     null, null, 'fixed'),
  ('00000000-0000-4000-8000-00000000d002', 'Scheduled exam', 'published', now() + interval '1 day', now() + interval '1 day 1 hour', 'fixed'),
  ('00000000-0000-4000-8000-00000000d003', 'Live exam',      'published', now() - interval '10 minutes', now() + interval '1 hour', 'fixed'),
  ('00000000-0000-4000-8000-00000000d004', 'Always exam',    'published', now() - interval '3 days', now() - interval '2 days', 'always'),
  ('00000000-0000-4000-8000-00000000d005', 'Closed exam',    'published', now() - interval '10 minutes', now() + interval '1 hour', 'fixed'),
  ('00000000-0000-4000-8000-00000000d007', 'Archived exam',  'archived',  now() - interval '9 days', now() - interval '8 days', 'fixed');
insert into exam_questions (exam_id, question_id, position) values
  ('00000000-0000-4000-8000-00000000d001', '00000000-0000-4000-8000-000000000101', 1),
  ('00000000-0000-4000-8000-00000000d002', '00000000-0000-4000-8000-000000000102', 1),
  ('00000000-0000-4000-8000-00000000d003', '00000000-0000-4000-8000-000000000103', 1),
  ('00000000-0000-4000-8000-00000000d004', '00000000-0000-4000-8000-000000000104', 1),
  ('00000000-0000-4000-8000-00000000d005', '00000000-0000-4000-8000-000000000105', 1),
  ('00000000-0000-4000-8000-00000000d007', '00000000-0000-4000-8000-000000000107', 1);

-- q5: answered and submitted while the exam was live, then the exam closes.
do $$
declare v_attempt uuid;
begin
  v_attempt := start_attempt('00000000-0000-4000-8000-00000000d005', '00000000-0000-4000-8000-0000000005d1');
  perform submit_attempt(v_attempt, '00000000-0000-4000-8000-0000000005d1',
                         '[{"q":"00000000-0000-4000-8000-000000000105","o":"A","m":false,"s":1}]'::jsonb, false);
end $$;
update exams set starts_at = now() - interval '3 hours', live_ends_at = now() - interval '2 hours'
 where id = '00000000-0000-4000-8000-00000000d005';

-- Captures the JSON detail of a QUESTION_IN_USE error (null when no error is raised).
create function pg_temp.blocking(p_ids uuid[]) returns jsonb language plpgsql as $$
declare v_detail text;
begin
  perform public.delete_questions('00000000-0000-4000-8000-0000000000d1', p_ids);
  return null;
exception when others then
  get stacked diagnostics v_detail = pg_exception_detail;
  return v_detail::jsonb;
end $$;

select is(public.exam_phase(e), 'closed', 'fixture: the answered exam is closed') from exams e where id = '00000000-0000-4000-8000-00000000d005';

select throws_ok($$select * from delete_questions('00000000-0000-4000-8000-0000000000d1', array['00000000-0000-4000-8000-000000000101']::uuid[])$$,
                 'P0001', 'QUESTION_IN_USE', 'a question in a draft exam is blocked');
select throws_ok($$select * from delete_questions('00000000-0000-4000-8000-0000000000d1', array['00000000-0000-4000-8000-000000000102']::uuid[])$$,
                 'P0001', 'QUESTION_IN_USE', 'a question in a scheduled exam is blocked');
select throws_ok($$select * from delete_questions('00000000-0000-4000-8000-0000000000d1', array['00000000-0000-4000-8000-000000000103']::uuid[])$$,
                 'P0001', 'QUESTION_IN_USE', 'a question in a live exam is blocked');
select throws_ok($$select * from delete_questions('00000000-0000-4000-8000-0000000000d1', array['00000000-0000-4000-8000-000000000104']::uuid[])$$,
                 'P0001', 'QUESTION_IN_USE', 'a question in an always-available (late window) exam is blocked');
select is((pg_temp.blocking(array['00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000103']::uuid[])
            -> 0 ->> 'title') is not null, true, 'the error detail lists the blocking exams');
select is(jsonb_array_length(pg_temp.blocking(array['00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000103',
                                                    '00000000-0000-4000-8000-000000000106']::uuid[])), 2,
          'only the exams that block are listed');
select is((select deleted_at from questions where id = '00000000-0000-4000-8000-000000000106'), null,
          'a blocked request changes nothing (the deletable q6 survives)');

create temp table t_result as
  select * from delete_questions('00000000-0000-4000-8000-0000000000d1',
    array['00000000-0000-4000-8000-000000000105', '00000000-0000-4000-8000-000000000106', '00000000-0000-4000-8000-000000000107']::uuid[]);

select is((select count(*)::int from t_result), 3, 'three questions processed');
select is((select mode from t_result where question_id = '00000000-0000-4000-8000-000000000105'), 'soft', 'answered in a closed exam → soft');
select is((select mode from t_result where question_id = '00000000-0000-4000-8000-000000000107'), 'soft', 'in an archived exam → soft');
select is((select mode from t_result where question_id = '00000000-0000-4000-8000-000000000106'), 'hard', 'never used → hard');
select is((select image_paths from t_result where question_id = '00000000-0000-4000-8000-000000000106'),
          array['questions/00000000-0000-4000-8000-0000000006a1.png', 'questions/00000000-0000-4000-8000-0000000006b1.webp'],
          'hard delete returns the image paths for Storage cleanup, minus the one q8 still uses');
select ok(exists (select 1 from questions where id = '00000000-0000-4000-8000-000000000108' and deleted_at is null), 'q8 is untouched');
select ok(not exists (select 1 from questions where id = '00000000-0000-4000-8000-000000000106'), 'q6 row is gone');
select is((select deleted_by from questions where id = '00000000-0000-4000-8000-000000000105' and deleted_at is not null),
          '00000000-0000-4000-8000-0000000000d1'::uuid, 'q5 is soft-deleted and records who deleted it');
select is((select count(*)::int from attempt_answers where question_id = '00000000-0000-4000-8000-000000000105'), 1,
          'past answers stay (results and reviews keep working)');
select is((select count(*)::int from audit_log
            where action = 'question.delete' and entity_id in (select question_id::text from t_result)), 3,
          'one audit row per deleted question');
select throws_ok($$select set_exam_questions('00000000-0000-4000-8000-00000000d001', array['00000000-0000-4000-8000-000000000105']::uuid[])$$,
                 'P0001', 'EXAM_INACTIVE_QUESTIONS', 'a soft-deleted question cannot be added to an exam');

select * from finish();
rollback;
