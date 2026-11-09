-- Exam phase, card statuses, constraints (docs/05_Schema.md §8.1, docs/02_AppFlow.md §3.4–3.5).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(18);

insert into subjects (id, slug, name_bn, name_en) values ('00000000-0000-4000-8000-0000000000a1', 't-ict', 'আইসিটি', 'ICT');
insert into chapters (id, subject_id, number, name_bn, name_en)
values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a1', 1, 'অধ্যায় ১', 'Chapter 1');
insert into questions (id, chapter_id, stem, option_a, option_b, option_c, option_d, correct_option, status) values
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000c1', 'Q1', 'a', 'b', 'c', 'd', 'A', 'active');
insert into plans (id, code, name_bn, name_en, duration_days, price_bdt) values
  ('00000000-0000-4000-8000-0000000000f1', 't-plan-a', 'এ', 'A', 30, 100);
insert into students (id, mobile, email, pin_hash, access_starts_at, access_expires_at) values
  ('00000000-0000-4000-8000-0000000005a1', '01990000001', 'a@t.test', 'x', now() - interval '1 day', now() + interval '30 days'),
  ('00000000-0000-4000-8000-0000000005a2', '01990000002', 'b@t.test', 'x', now() - interval '60 days', now() - interval '1 day');

insert into exams (id, title, status, access_mode, starts_at, live_ends_at, late_until) values
  ('00000000-0000-4000-8000-00000000e001', 'Upcoming', 'published', 'fixed',  now() + interval '1 hour',  now() + interval '2 hours', null),
  ('00000000-0000-4000-8000-00000000e002', 'Live',     'published', 'fixed',  now() - interval '1 hour',  now() + interval '1 hour',  null),
  ('00000000-0000-4000-8000-00000000e003', 'Window',   'published', 'window', now() - interval '2 hours', now() - interval '1 hour',  now() + interval '1 day'),
  ('00000000-0000-4000-8000-00000000e004', 'Closed',   'published', 'fixed',  now() - interval '2 hours', now() - interval '1 hour',  null),
  ('00000000-0000-4000-8000-00000000e005', 'Always',   'published', 'always', now() - interval '2 hours', now() - interval '1 hour',  null),
  ('00000000-0000-4000-8000-00000000e006', 'Draft',    'draft',     'fixed',  null, null, null),
  ('00000000-0000-4000-8000-00000000e007', 'Plans',    'published', 'fixed',  now() - interval '1 hour',  now() + interval '1 hour',  null);
update exams set audience = 'plans' where id = '00000000-0000-4000-8000-00000000e007';
insert into exam_audience_plans values ('00000000-0000-4000-8000-00000000e007', '00000000-0000-4000-8000-0000000000f1');
insert into exam_questions (exam_id, question_id, position)
select id, '00000000-0000-4000-8000-000000000001', 1 from exams
 where status = 'published' and id::text like '00000000-0000-4000-8000-00000000e00%';

select results_eq(
  $$select title, exam_phase(e) from exams e where id::text like '00000000-0000-4000-8000-00000000e00%' order by title$$,
  $$values ('Always', 'late_window'), ('Closed', 'closed'), ('Draft', 'draft'), ('Live', 'live'),
           ('Plans', 'live'), ('Upcoming', 'scheduled'), ('Window', 'late_window')$$,
  'exam_phase covers every branch');

select is(exam_phase(e, now() + interval '2 days'), 'closed', 'window exam closes after late_until')
  from exams e where id = '00000000-0000-4000-8000-00000000e003';

-- completed attempt on the Live exam for student 1
do $$ begin
  perform start_attempt('00000000-0000-4000-8000-00000000e002', '00000000-0000-4000-8000-0000000005a1');
  perform submit_attempt((select id from exam_attempts where exam_id = '00000000-0000-4000-8000-00000000e002'),
                         '00000000-0000-4000-8000-0000000005a1', '[]'::jsonb, false);
end $$;

select results_eq(
  $$select title, card_status from student_exam_cards('00000000-0000-4000-8000-0000000005a1')
     where exam_id::text like '00000000-0000-4000-8000-00000000e00%' order by title$$,
  $$values ('Always', 'missed_available'), ('Closed', 'missed'), ('Live', 'completed'),
           ('Upcoming', 'upcoming'), ('Window', 'missed_available')$$,
  'card statuses for an active student (unassigned and draft exams hidden)');

select results_eq(
  $$select distinct card_status from student_exam_cards('00000000-0000-4000-8000-0000000005a2')
     where exam_id::text like '00000000-0000-4000-8000-00000000e00%'$$,
  $$values ('locked')$$, 'expired student sees every card as locked');

update students set plan_id = '00000000-0000-4000-8000-0000000000f1' where id = '00000000-0000-4000-8000-0000000005a1';
select is((select card_status from student_exam_cards('00000000-0000-4000-8000-0000000005a1') where exam_id = '00000000-0000-4000-8000-00000000e007'),
          'live', 'a student of the targeted plan sees the plans-audience exam');
select throws_ok($$select start_attempt('00000000-0000-4000-8000-00000000e007', '00000000-0000-4000-8000-0000000005a2')$$,
                 'P0001', 'ACCESS_INACTIVE', 'inactive check precedes availability');

-- in-progress overdue attempt is finalized lazily by student_exam_cards
do $$ begin perform start_attempt('00000000-0000-4000-8000-00000000e005', '00000000-0000-4000-8000-0000000005a1'); end $$;
update exam_attempts set deadline_at = now() - interval '1 minute' where exam_id = '00000000-0000-4000-8000-00000000e005';
select is((select card_status from student_exam_cards('00000000-0000-4000-8000-0000000005a1') where exam_id = '00000000-0000-4000-8000-00000000e005'),
          'completed', 'overdue attempt is finalized when cards are read');

-- constraints
select throws_ok($$insert into exams (title, access_mode, starts_at, live_ends_at) values ('Bad', 'window', now(), now() + interval '1 hour')$$,
                 '23514', null, 'window mode requires late_until');
select throws_ok($$insert into exams (title, starts_at, live_ends_at) values ('Bad', now(), now() - interval '1 hour')$$,
                 '23514', null, 'live_ends_at must be after starts_at');
select throws_ok($$insert into exams (title, status) values ('Bad', 'published')$$,
                 '23514', null, 'published non-sample exams need times');
update exams set is_featured = false where is_featured;
update exams set is_featured = true where id = '00000000-0000-4000-8000-00000000e001';
select throws_ok($$update exams set is_featured = true where id = '00000000-0000-4000-8000-00000000e002'$$, '23505', null, 'only one featured exam');
update exams set status = 'archived' where is_sample;  -- park the seeded sample exam, if any
select throws_ok($$insert into exams (title, status, is_sample) values ('S1', 'published', true), ('S2', 'published', true)$$,
                 '23505', null, 'only one published sample exam');
select throws_ok($$update exams set status = 'draft' where id = '00000000-0000-4000-8000-00000000e002'$$, 'P0001', 'EXAM_LOCKED',
                 'cannot unpublish an exam with attempts');

-- question triggers
insert into questions (chapter_id, stem, option_a, option_b, option_c, option_d, correct_option)
values ('00000000-0000-4000-8000-0000000000c1', '  q1 ', 'A', 'B', 'C', 'D', 'A');
select is((select count(distinct content_hash)::int from questions
            where chapter_id = '00000000-0000-4000-8000-0000000000c1' and lower(trim(stem)) = 'q1'), 1,
          'normalised duplicate content has the same hash');
insert into topics (id, chapter_id, name_bn, name_en) values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000c1', 'টপিক', 'Topic');
insert into chapters (id, subject_id, number, name_bn, name_en)
values ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000a1', 2, 'অধ্যায় ২', 'Chapter 2');
select throws_ok($$insert into questions (chapter_id, topic_id, stem, option_a, option_b, option_c, option_d, correct_option)
                   values ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000f1', 'x', 'a', 'b', 'c', 'd', 'A')$$,
                 'P0001', 'TOPIC_CHAPTER_MISMATCH', 'topic must belong to the chapter');
do $$ begin perform log_audit('system', 'test.event', 'setting'); end $$;
select throws_ok($$update audit_log set action = 'x'$$, 'P0001', 'AUDIT_LOG_IMMUTABLE', 'audit log is append-only');
select throws_ok($$delete from audit_log$$, 'P0001', 'AUDIT_LOG_IMMUTABLE', 'audit log rows cannot be deleted');
do $$ begin perform log_audit('student', 'test.student_event', 'student', p_student := '00000000-0000-4000-8000-0000000005a2'); end $$;
select lives_ok($$delete from students where id = '00000000-0000-4000-8000-0000000005a2'$$,
                'a student with audit rows can be deleted (actor reference set to null)');

select * from finish();
rollback;
