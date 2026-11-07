-- Phase 2 support functions (0013).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(12);

insert into subjects (id, slug, name_bn, name_en) values ('00000000-0000-4000-8000-0000000000a1', 't-ict', 'আইসিটি', 'ICT');
insert into chapters (id, subject_id, number, name_bn, name_en)
values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a1', 1, 'অধ্যায় ১', 'Chapter 1');
insert into questions (id, chapter_id, stem, option_a, option_b, option_c, option_d, correct_option, status) values
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000c1', 'Q1', 'a', 'b', 'c', 'd', 'A', 'active'),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000c1', 'Q2', 'a', 'b', 'c', 'd', 'B', 'active'),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-0000000000c1', 'Q3', 'a', 'b', 'c', 'd', 'C', 'draft');
insert into students (id, mobile, email, pin_hash, access_starts_at, access_expires_at) values
  ('00000000-0000-4000-8000-0000000005a1', '01990000001', 'a@t.test', 'x', now() - interval '1 day', now() + interval '30 days');
insert into exams (id, title, status, starts_at, live_ends_at) values
  ('00000000-0000-4000-8000-00000000e001', 'Live', 'published', now() - interval '5 minutes', now() + interval '1 hour');
insert into tags (id, name) values ('00000000-0000-4000-8000-0000000000f1', 't-tag-1'), ('00000000-0000-4000-8000-0000000000f2', 't-tag-2');

select is((select hash from content_hashes('[{"stem":"  q1 ","a":"A","b":"B ","c":"c","d":"D"}]'::jsonb)),
          (select content_hash from questions where id = '00000000-0000-4000-8000-000000000001'),
          'content_hashes matches the trigger hash after normalisation');

select throws_ok($$select set_exam_questions('00000000-0000-4000-8000-00000000e001',
                   array['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003']::uuid[])$$,
                 'P0001', 'EXAM_INACTIVE_QUESTIONS', 'draft questions cannot be added to an exam');
select is(set_exam_questions('00000000-0000-4000-8000-00000000e001',
            array['00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001',
                  '00000000-0000-4000-8000-000000000002']::uuid[]), 2, 'duplicates are dropped');
select results_eq($$select question_id::text, position from exam_questions
                    where exam_id = '00000000-0000-4000-8000-00000000e001' order by position$$,
                  $$values ('00000000-0000-4000-8000-000000000002', 1), ('00000000-0000-4000-8000-000000000001', 2)$$,
                  'order is preserved');
select is((select question_count from exams where id = '00000000-0000-4000-8000-00000000e001'), 2, 'question_count updated');

select is(set_exam_audience('00000000-0000-4000-8000-00000000e001', 'selected',
            array['00000000-0000-4000-8000-0000000005a1', gen_random_uuid()]), 1, 'only existing students are assigned');
select is(set_exam_audience('00000000-0000-4000-8000-00000000e001', 'all_active', null), 0, 'all_active clears assignees');
select is((select count(*)::int from exam_assignees where exam_id = '00000000-0000-4000-8000-00000000e001'), 0, 'assignees removed');

do $$ begin perform set_question_tags('00000000-0000-4000-8000-000000000001',
  array['00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000f2']::uuid[]); end $$;
do $$ begin perform set_question_tags('00000000-0000-4000-8000-000000000001',
  array['00000000-0000-4000-8000-0000000000f2']::uuid[]); end $$;
select results_eq($$select tag_id::text from question_tags where question_id = '00000000-0000-4000-8000-000000000001'$$,
                  $$values ('00000000-0000-4000-8000-0000000000f2')$$, 'set_question_tags replaces the tag set');

-- correct-option lock once the question is in an exam with attempts
do $$ begin perform start_attempt('00000000-0000-4000-8000-00000000e001', '00000000-0000-4000-8000-0000000005a1'); end $$;
select throws_ok($$update questions set correct_option = 'D' where id = '00000000-0000-4000-8000-000000000001'$$,
                 'P0001', 'QUESTION_LOCKED_CORRECT_OPTION', 'answer key is locked once used in a taken exam');
select lives_ok($$update questions set stem = 'Q1 (typo fixed)' where id = '00000000-0000-4000-8000-000000000001'$$,
                'text edits are still allowed');
select is((select correct_rate from questions where id = '00000000-0000-4000-8000-000000000003'), null,
          'correct_rate is null before any answers');

select * from finish();
rollback;
