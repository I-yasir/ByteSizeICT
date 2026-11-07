-- P4.12 scoring table through start_attempt → submit_attempt → score_attempt (TRD §8.5).
-- Same rows as tests/unit/scoring.test.ts. Questions Q1..Q4 have correct options A, B, C, D.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(12);

insert into subjects (id, slug, name_bn, name_en) values ('00000000-0000-4000-8000-0000000005c1', 't-score', 'স্কোর', 'Score');
insert into chapters (id, subject_id, number, name_bn, name_en)
values ('00000000-0000-4000-8000-0000000005c2', '00000000-0000-4000-8000-0000000005c1', 1, 'অধ্যায়', 'Chapter');
insert into questions (id, chapter_id, stem, option_a, option_b, option_c, option_d, correct_option, status) values
  ('00000000-0000-4000-8000-0000000005d1', '00000000-0000-4000-8000-0000000005c2', 'S1', 'a', 'b', 'c', 'd', 'A', 'active'),
  ('00000000-0000-4000-8000-0000000005d2', '00000000-0000-4000-8000-0000000005c2', 'S2', 'a', 'b', 'c', 'd', 'B', 'active'),
  ('00000000-0000-4000-8000-0000000005d3', '00000000-0000-4000-8000-0000000005c2', 'S3', 'a', 'b', 'c', 'd', 'C', 'active'),
  ('00000000-0000-4000-8000-0000000005d4', '00000000-0000-4000-8000-0000000005c2', 'S4', 'a', 'b', 'c', 'd', 'D', 'active');

create sequence pg_temp.case_no;

-- One fresh exam + student per case (marks are locked once an attempt exists). Returns the attempt id.
create function pg_temp.score_case(p_mpq numeric, p_neg numeric, p_answers text[]) returns uuid
language plpgsql as $$
declare
  n int := nextval('pg_temp.case_no');
  v_exam uuid := gen_random_uuid();
  v_student uuid := gen_random_uuid();
  v_attempt uuid;
  v_changes jsonb := '[]';
  q uuid[] := array['00000000-0000-4000-8000-0000000005d1', '00000000-0000-4000-8000-0000000005d2',
                    '00000000-0000-4000-8000-0000000005d3', '00000000-0000-4000-8000-0000000005d4']::uuid[];
begin
  insert into exams (id, title, status, starts_at, live_ends_at, duration_minutes, marks_per_question, negative_mark)
  values (v_exam, 'Scoring ' || n, 'published', now() - interval '5 minutes', now() + interval '1 hour', 30, p_mpq, p_neg);
  insert into exam_questions (exam_id, question_id, position) select v_exam, q[i], i from generate_series(1, 4) i;
  insert into students (id, mobile, email, pin_hash, access_starts_at, access_expires_at)
  values (v_student, '0199800' || lpad(n::text, 4, '0'), n || '@score.test', 'x', now() - interval '1 day', now() + interval '1 day');
  v_attempt := start_attempt(v_exam, v_student);
  for i in 1..4 loop
    v_changes := v_changes || jsonb_build_object('q', q[i], 'o', p_answers[i], 'm', false, 's', i);
  end loop;
  perform submit_attempt(v_attempt, v_student, v_changes, false);
  return v_attempt;
end $$;

create temp table cases (label text, attempt uuid);
insert into cases values
  ('neg 0',        pg_temp.score_case(1,    0,    array['A', 'A', null, null])),
  ('neg 0.25',     pg_temp.score_case(1,    0.25, array['A', 'A', 'A', null])),
  ('neg 0.5',      pg_temp.score_case(1,    0.5,  array['A', 'A', 'A', 'A'])),
  ('neg 1',        pg_temp.score_case(1,    1,    array['A', 'A', null, null])),
  ('all skipped',  pg_temp.score_case(1,    0.25, array[null, null, null, null]::text[])),
  ('all wrong',    pg_temp.score_case(1,    0.25, array['B', 'A', 'A', 'A'])),
  ('fractional',   pg_temp.score_case(0.75, 0.33, array['A', 'B', 'A', 'A'])),
  ('mpq 2',        pg_temp.score_case(2,    0.5,  array['A', 'B', 'C', 'A']));

select is((select score from exam_attempts where id = (select attempt from cases where label = 'neg 0')), 1.00::numeric, 'no negative marking: 1 right, 1 wrong = 1');
select is((select score from exam_attempts where id = (select attempt from cases where label = 'neg 0.25')), 0.50::numeric, '−0.25: 1 right, 2 wrong = 0.5');
select is((select score from exam_attempts where id = (select attempt from cases where label = 'neg 0.5')), -0.50::numeric, '−0.5: 1 right, 3 wrong = −0.5 (negative kept)');
select is((select score from exam_attempts where id = (select attempt from cases where label = 'neg 1')), 0.00::numeric, '−1: 1 right, 1 wrong = 0');
select is((select score from exam_attempts where id = (select attempt from cases where label = 'all skipped')), 0.00::numeric, 'all skipped = 0');
select is((select skipped_count from exam_attempts where id = (select attempt from cases where label = 'all skipped')), 4, 'all skipped counts 4 skipped');
select is((select score from exam_attempts where id = (select attempt from cases where label = 'all wrong')), -1.00::numeric, 'all wrong at −0.25 = −1 (not clamped)');
select is((select correct_count from exam_attempts where id = (select attempt from cases where label = 'all wrong')), 0, 'all wrong has 0 correct');
select is((select score from exam_attempts where id = (select attempt from cases where label = 'fractional')), 0.84::numeric, '0.75 × 2 − 0.33 × 2 = 0.84');
select is((select score from exam_attempts where id = (select attempt from cases where label = 'mpq 2')), 5.50::numeric, '2 marks × 3 − 0.5 = 5.5');
select is((select incorrect_count from exam_attempts where id = (select attempt from cases where label = 'mpq 2')), 1, 'mpq 2 case has 1 incorrect');
select is((select count(*)::int from attempt_answers where attempt_id = (select attempt from cases where label = 'neg 0.5') and is_correct),
          1, 'is_correct is set per answer at scoring');

select * from finish();
rollback;
