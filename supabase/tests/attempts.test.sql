-- Exam runtime: start / save / submit / score / finalize (docs/05_Schema.md §8.2, TRD §8).
-- Note: now() is constant within the test transaction.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(23);

insert into subjects (id, slug, name_bn, name_en) values ('00000000-0000-4000-8000-0000000000a1', 't-ict', 'আইসিটি', 'ICT');
insert into chapters (id, subject_id, number, name_bn, name_en)
values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a1', 1, 'অধ্যায় ১', 'Chapter 1');
insert into questions (id, chapter_id, stem, option_a, option_b, option_c, option_d, correct_option, status) values
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000c1', 'Q1', 'a', 'b', 'c', 'd', 'A', 'active'),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000c1', 'Q2', 'a', 'b', 'c', 'd', 'B', 'active'),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-0000000000c1', 'Q3', 'a', 'b', 'c', 'd', 'C', 'active'),
  ('00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-0000000000c1', 'Q4', 'a', 'b', 'c', 'd', 'D', 'active');

insert into students (id, mobile, email, pin_hash, access_starts_at, access_expires_at) values
  ('00000000-0000-4000-8000-0000000005a1', '01990000001', 'a@t.test', 'x', now() - interval '1 day', now() + interval '30 days'),
  ('00000000-0000-4000-8000-0000000005a2', '01990000002', 'b@t.test', 'x', now() - interval '60 days', now() - interval '1 day'),
  ('00000000-0000-4000-8000-0000000005a3', '01990000003', 'c@t.test', 'x', now() - interval '1 day', now() + interval '30 days');

-- live fixed exam (marks 1, negative 0.25, 30 min, live window 10 min left)
insert into exams (id, title, status, starts_at, live_ends_at, duration_minutes, negative_mark) values
  ('00000000-0000-4000-8000-00000000e101', 'Live fixed', 'published', now() - interval '20 minutes', now() + interval '10 minutes', 30, 0.25),
  ('00000000-0000-4000-8000-00000000e102', 'Scheduled', 'published', now() + interval '1 day', now() + interval '1 day 30 minutes', 30, 0),
  ('00000000-0000-4000-8000-00000000e103', 'Always', 'published', now() - interval '3 days', now() - interval '2 days', 30, 0);
update exams set access_mode = 'always' where id = '00000000-0000-4000-8000-00000000e103';
insert into exam_questions (exam_id, question_id, position) values
  ('00000000-0000-4000-8000-00000000e101', '00000000-0000-4000-8000-000000000001', 1),
  ('00000000-0000-4000-8000-00000000e101', '00000000-0000-4000-8000-000000000002', 2),
  ('00000000-0000-4000-8000-00000000e101', '00000000-0000-4000-8000-000000000003', 3),
  ('00000000-0000-4000-8000-00000000e101', '00000000-0000-4000-8000-000000000004', 4),
  ('00000000-0000-4000-8000-00000000e102', '00000000-0000-4000-8000-000000000001', 1),
  ('00000000-0000-4000-8000-00000000e103', '00000000-0000-4000-8000-000000000001', 1);

select is((select question_count from exams where id = '00000000-0000-4000-8000-00000000e101'), 4,
          'question_count is maintained by trigger');

-- start
create temp table t_ids (name text primary key, id uuid);
insert into t_ids values ('a1', start_attempt('00000000-0000-4000-8000-00000000e101', '00000000-0000-4000-8000-0000000005a1'));
select isnt((select id from t_ids where name = 'a1'), null, 'start_attempt returns an attempt id');
select is(start_attempt('00000000-0000-4000-8000-00000000e101', '00000000-0000-4000-8000-0000000005a1'),
          (select id from t_ids where name = 'a1'), 'start_attempt is idempotent');
select is((select deadline_at from exam_attempts where id = (select id from t_ids where name = 'a1')),
          now() + interval '10 minutes', 'fixed mode caps the deadline at live_ends_at');
select is((select option_order ->> '00000000-0000-4000-8000-000000000001' from exam_attempts
            where id = (select id from t_ids where name = 'a1')), 'ABCD', 'no option shuffle → ABCD');

select throws_ok($$select start_attempt('00000000-0000-4000-8000-00000000e102', '00000000-0000-4000-8000-0000000005a1')$$,
                 'P0001', 'EXAM_NOT_STARTED', 'scheduled exam cannot be started');
select throws_ok($$select start_attempt('00000000-0000-4000-8000-00000000e101', '00000000-0000-4000-8000-0000000005a2')$$,
                 'P0001', 'ACCESS_INACTIVE', 'expired student cannot start');

insert into t_ids values ('late', start_attempt('00000000-0000-4000-8000-00000000e103', '00000000-0000-4000-8000-0000000005a1'));
select ok((select is_late from exam_attempts where id = (select id from t_ids where name = 'late')),
          'starting after live_ends_at in always mode is a late attempt');
select is((select deadline_at from exam_attempts where id = (select id from t_ids where name = 'late')),
          now() + interval '30 minutes', 'always mode gets the full duration');

-- save: newer seq wins, older ignored, foreign question ignored
select is(save_answers((select id from t_ids where name = 'a1'), '00000000-0000-4000-8000-0000000005a1',
  '[{"q":"00000000-0000-4000-8000-000000000001","o":"B","m":false,"s":2},
    {"q":"00000000-0000-4000-8000-000000000002","o":"B","m":true,"s":3},
    {"q":"00000000-0000-4000-8000-0000000000ff","o":"A","m":false,"s":4}]'::jsonb, 2), 2,
  'save_answers applies changes for questions in the paper only');
select is(save_answers((select id from t_ids where name = 'a1'), '00000000-0000-4000-8000-0000000005a1',
  '[{"q":"00000000-0000-4000-8000-000000000001","o":"C","m":false,"s":1}]'::jsonb), 0,
  'an older seq is ignored');
select is((select selected_option::text from attempt_answers where attempt_id = (select id from t_ids where name = 'a1')
             and question_id = '00000000-0000-4000-8000-000000000001'), 'B', 'stored answer keeps the newer value');
select is((select last_question_index from exam_attempts where id = (select id from t_ids where name = 'a1')), 2,
          'last_question_index is saved');
select throws_ok($$select save_answers((select id from t_ids where name = 'a1'), '00000000-0000-4000-8000-0000000005a3', '[]'::jsonb)$$,
                 'P0001', 'NOT_FOUND', 'another student cannot save into the attempt');

-- exam is now locked
select throws_ok($$insert into exam_questions (exam_id, question_id, position)
                   values ('00000000-0000-4000-8000-00000000e101', '00000000-0000-4000-8000-000000000001', 9)$$,
                 'P0001', 'EXAM_LOCKED', 'exam questions are locked once an attempt exists');
select throws_ok($$update exams set negative_mark = 1 where id = '00000000-0000-4000-8000-00000000e101'$$,
                 'P0001', 'EXAM_LOCKED', 'scoring settings are locked once an attempt exists');

-- submit: final changes applied → Q1 A (correct, seq 5), Q2 B (correct), Q3 A (wrong), Q4 skipped
select is(submit_attempt((select id from t_ids where name = 'a1'), '00000000-0000-4000-8000-0000000005a1',
  '[{"q":"00000000-0000-4000-8000-000000000001","o":"A","m":false,"s":5},
    {"q":"00000000-0000-4000-8000-000000000003","o":"A","m":false,"s":6}]'::jsonb, false),
  (select id from t_ids where name = 'a1'), 'submit_attempt returns the attempt id');
select results_eq(
  $$select status::text, score, correct_count, incorrect_count, skipped_count from exam_attempts
     where id = (select id from t_ids where name = 'a1')$$,
  $$values ('submitted', 1.75::numeric, 2, 1, 1)$$,
  'scoring: 2 correct − 1 × 0.25 = 1.75, 1 skipped');
select throws_ok($$select submit_attempt((select id from t_ids where name = 'a1'), '00000000-0000-4000-8000-0000000005a1', '[]'::jsonb, false)$$,
                 'P0001', 'ATTEMPT_CLOSED', 'second submit is rejected');
select is((select count(*)::int from outbox where dedupe_key = 'sheet_result_append:' || (select id from t_ids where name = 'a1')),
          1, 'a sheet result job is enqueued once');

-- overdue: past the 15 s grace → saves rejected, cron finalizes as auto_submitted
insert into t_ids values ('a3', start_attempt('00000000-0000-4000-8000-00000000e101', '00000000-0000-4000-8000-0000000005a3'));
update exam_attempts set deadline_at = now() - interval '1 minute' where id = (select id from t_ids where name = 'a3');
select throws_ok($$select save_answers((select id from t_ids where name = 'a3'), '00000000-0000-4000-8000-0000000005a3', '[]'::jsonb)$$,
                 'P0001', 'ATTEMPT_CLOSED', 'saves after deadline + grace are rejected');
select cmp_ok(finalize_overdue_attempts(), '>=', 1, 'finalize_overdue_attempts finalizes overdue attempts');
select is((select status::text from exam_attempts where id = (select id from t_ids where name = 'a3')), 'auto_submitted',
          'overdue attempt becomes auto_submitted');

select * from finish();
rollback;
