-- R1.1 exam audiences by plan (0018, docs/05_Schema.md §8.1, §8.6; D1/D2).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(16);

insert into subjects (id, slug, name_bn, name_en) values ('00000000-0000-4000-8000-00000000aa01', 't-aud', 'অডিয়েন্স', 'Audience');
insert into chapters (id, subject_id, number, name_bn, name_en)
values ('00000000-0000-4000-8000-00000000ac01', '00000000-0000-4000-8000-00000000aa01', 1, 'অধ্যায়', 'Chapter');
insert into questions (id, chapter_id, stem, option_a, option_b, option_c, option_d, correct_option, status)
values ('00000000-0000-4000-8000-00000000a0e1', '00000000-0000-4000-8000-00000000ac01', 'AQ', 'a', 'b', 'c', 'd', 'A', 'active');
insert into plans (id, code, name_bn, name_en, duration_days, price_bdt, is_active) values
  ('00000000-0000-4000-8000-00000000a0a1', 't-aud-a', 'এ', 'A', 30, 100, true),
  ('00000000-0000-4000-8000-00000000a0b1', 't-aud-b', 'বি', 'B', 30, 100, true),
  ('00000000-0000-4000-8000-00000000a0c1', 't-aud-c', 'সি', 'C', 30, 100, false);
insert into students (id, mobile, email, pin_hash, access_starts_at, access_expires_at, plan_id) values
  ('00000000-0000-4000-8000-00000000a5a1', '01990000701', 'pa@t.test', 'x', now() - interval '1 day', now() + interval '30 days', '00000000-0000-4000-8000-00000000a0a1'),
  ('00000000-0000-4000-8000-00000000a5b1', '01990000702', 'pb@t.test', 'x', now() - interval '1 day', now() + interval '30 days', '00000000-0000-4000-8000-00000000a0b1'),
  ('00000000-0000-4000-8000-00000000a5d1', '01990000703', 'pn@t.test', 'x', now() - interval '1 day', now() + interval '30 days', null);
insert into exams (id, title, status, access_mode, starts_at, live_ends_at) values
  ('00000000-0000-4000-8000-00000000ae01', 'For everyone', 'published', 'fixed', now() - interval '5 minutes', now() + interval '1 hour'),
  ('00000000-0000-4000-8000-00000000ae02', 'For plan A',   'published', 'fixed', now() - interval '5 minutes', now() + interval '1 hour'),
  ('00000000-0000-4000-8000-00000000ae03', 'For A and C',  'published', 'fixed', now() - interval '5 minutes', now() + interval '1 hour');
insert into exam_questions (exam_id, question_id, position)
select id, '00000000-0000-4000-8000-00000000a0e1', 1 from exams where id::text like '00000000-0000-4000-8000-00000000ae0%';

select is(set_exam_audience('00000000-0000-4000-8000-00000000ae02', 'plans', array['00000000-0000-4000-8000-00000000a0a1']::uuid[]), 1, 'one plan stored');
select is(set_exam_audience('00000000-0000-4000-8000-00000000ae03', 'plans',
            array['00000000-0000-4000-8000-00000000a0a1', '00000000-0000-4000-8000-00000000a0c1', '00000000-0000-4000-8000-00000000a0a1']::uuid[]),
          2, 'duplicates dropped; an inactive plan can still be targeted');
select throws_ok($$select set_exam_audience(gen_random_uuid(), 'all_active', null)$$, 'P0001', 'NOT_FOUND', 'unknown exam');

create function pg_temp.visible(p_student uuid) returns text[] language sql as $$
  select coalesce(array_agg(title order by title), '{}') from student_exam_cards(p_student) where exam_id::text like '00000000-0000-4000-8000-00000000ae0%'
$$;
select is(pg_temp.visible('00000000-0000-4000-8000-00000000a5a1'), array['For A and C', 'For everyone', 'For plan A'], 'a plan-A student sees all three');
select is(pg_temp.visible('00000000-0000-4000-8000-00000000a5b1'), array['For everyone'], 'a plan-B student sees only the all_active exam');
select is(pg_temp.visible('00000000-0000-4000-8000-00000000a5d1'), array['For everyone'], 'a student without a plan sees only all_active exams');

select ok((select student_is_assigned(e, '00000000-0000-4000-8000-00000000a5a1') from exams e where id = '00000000-0000-4000-8000-00000000ae02'), 'assigned: plan A');
select ok(not (select student_is_assigned(e, '00000000-0000-4000-8000-00000000a5b1') from exams e where id = '00000000-0000-4000-8000-00000000ae02'), 'not assigned: plan B');

select throws_ok($$select start_attempt('00000000-0000-4000-8000-00000000ae02', '00000000-0000-4000-8000-00000000a5b1')$$,
                 'P0001', 'EXAM_NOT_AVAILABLE', 'start refuses a student outside the audience');
select ok((select start_attempt('00000000-0000-4000-8000-00000000ae02', '00000000-0000-4000-8000-00000000a5a1')) is not null, 'start works for a targeted student');

-- Renewal into another plan moves the student to that plan's exams.
update students set plan_id = '00000000-0000-4000-8000-00000000a0a1' where id = '00000000-0000-4000-8000-00000000a5b1';
select is(pg_temp.visible('00000000-0000-4000-8000-00000000a5b1'), array['For A and C', 'For everyone', 'For plan A'], 'plan switch → the new plan''s exams');

select is(set_exam_audience('00000000-0000-4000-8000-00000000ae02', 'all_active', array['00000000-0000-4000-8000-00000000a0a1']::uuid[]), 0, 'all_active stores no plans');
select is((select count(*)::int from exam_audience_plans where exam_id = '00000000-0000-4000-8000-00000000ae02'), 0, 'plans cleared');

select throws_ok($$delete from plans where id = '00000000-0000-4000-8000-00000000a0c1'$$, '23503', null, 'a targeted plan cannot be deleted');
select hasnt_table('public', 'exam_assignees', 'exam_assignees is gone');
select is((select array_agg(enumlabel::text order by enumsortorder) from pg_enum where enumtypid = 'public.exam_audience'::regtype),
          array['all_active', 'plans'], 'exam_audience is (all_active, plans)');

select * from finish();
rollback;
