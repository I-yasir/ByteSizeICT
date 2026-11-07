-- Admissions & student admin functions (docs/05_Schema.md §8.4).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(20);

insert into admins (id, email, display_name, password_hash)
values ('00000000-0000-4000-8000-0000000000ad', 'admin@t.test', 'Admin', 'x');
insert into plans (id, code, name_bn, name_en, duration_days, price_bdt)
values ('00000000-0000-4000-8000-0000000000b1', 't-30', '৩০ দিন', '30 days', 30, 500);

create temp table t_ids (name text primary key, id uuid);

-- new admission
insert into t_ids values ('adm1', submit_admission('01880000001', 'New@T.test', 'bkash', 'ab12 cd-34', '00000000-0000-4000-8000-0000000000b1', '10.0.0.1'));
select results_eq($$select kind::text, status::text, amount_bdt, trx_id_normalized from admissions where id = (select id from t_ids where name = 'adm1')$$,
                  $$values ('new', 'pending', 500, 'AB12CD34')$$, 'new admission stored with plan price and normalised TrxID');
select throws_ok($$select submit_admission('01880000009', 'x@t.test', 'nagad', 'AB12CD34', null, null)$$,
                 'P0001', 'TRX_DUPLICATE', 'duplicate TrxID (case/space/dash variant) is rejected');
select throws_ok($$select submit_admission('01880000001', 'x@t.test', 'nagad', 'ZZ99ZZ99', null, null)$$,
                 'P0001', 'PENDING_EXISTS', 'second pending request for a mobile is rejected');
select is((select count(*)::int from outbox where payload ->> 'admissionId' = (select id from t_ids where name = 'adm1')::text),
          2, 'submit enqueues sheet append + admin alert');

-- approve new
select results_eq(
  $$select kind::text, mobile from approve_admission((select id from t_ids where name = 'adm1'), '00000000-0000-4000-8000-0000000000ad',
      null, 500, now(), now() + interval '30 days', '$argon2id$fake', 'ok')$$,
  $$values ('new', '01880000001')$$, 'approve_admission creates a new student');
select results_eq($$select must_change_pin, credentials_status::text, pin_hash, email = 'new@t.test'::extensions.citext from students where mobile = '01880000001'$$,
                  $$values (true, 'pending', '$argon2id$fake', true)$$, 'new student has the given hash and must change PIN (email compared as citext)');
select is((select status::text from admissions where id = (select id from t_ids where name = 'adm1')), 'approved', 'admission approved');
select is((select count(*)::int from audit_log where action = 'admission.approve' and entity_id = (select id from t_ids where name = 'adm1')::text),
          1, 'approval is audited');
select throws_ok($$select * from approve_admission((select id from t_ids where name = 'adm1'), '00000000-0000-4000-8000-0000000000ad',
                     null, 500, now(), now() + interval '30 days', 'h', null)$$,
                 'P0001', 'ADMISSION_NOT_PENDING', 'approving twice is rejected');
select is((select count(*)::int from outbox where payload::text ilike '%pin%'), 0, 'no outbox payload mentions a PIN');

-- renewal of a cancelled student
update students set status = 'cancelled', access_expires_at = now() + interval '1 day' where mobile = '01880000001';
insert into t_ids values ('adm2', submit_admission('01880000001', 'renew@t.test', 'nagad', 'RENEW0001', null, null));
select is((select kind::text from admissions where id = (select id from t_ids where name = 'adm2')), 'renewal', 'existing mobile → renewal');
select results_eq(
  $$select kind::text from approve_admission((select id from t_ids where name = 'adm2'), '00000000-0000-4000-8000-0000000000ad',
      '00000000-0000-4000-8000-0000000000b1', 500, now(), now() + interval '90 days', null, null)$$,
  $$values ('renewal')$$, 'renewal approval needs no PIN hash');
select results_eq($$select status::text, access_expires_at, access_starts_at, email::text from students where mobile = '01880000001'$$,
                  $$values ('active', now() + interval '90 days', now(), 'renew@t.test')$$,
                  'renewal reactivates a cancelled student, restarts access and updates email');
select is((select count(*)::int from outbox where kind = 'email_renewal' and payload ->> 'admissionId' = (select id from t_ids where name = 'adm2')::text),
          1, 'renewal email enqueued');

-- reject
insert into t_ids values ('adm3', submit_admission('01880000003', 'r@t.test', 'rocket', 'REJECT001', null, null));
select throws_ok($$select reject_admission((select id from t_ids where name = 'adm3'), '00000000-0000-4000-8000-0000000000ad', '  ', true)$$,
                 'P0001', 'VALIDATION', 'reject requires a reason');
select lives_ok($$select reject_admission((select id from t_ids where name = 'adm3'), '00000000-0000-4000-8000-0000000000ad', 'TrxID not found', true)$$,
                'reject with a reason works');
select results_eq($$select status::text, reject_reason from admissions where id = (select id from t_ids where name = 'adm3')$$,
                  $$values ('rejected', 'TrxID not found')$$, 'admission rejected with reason');

-- student admin ops
insert into sessions (token_hash, student_id, expires_at)
select '\x01'::bytea, id, now() + interval '1 day' from students where mobile = '01880000001';
select is(admin_update_student_access('00000000-0000-4000-8000-0000000000ad',
            array[(select id from students where mobile = '01880000001')], 'cancel', null, null, 'test'), 1, 'cancel one student');
select is((select revoke_reason from sessions where token_hash = '\x01'::bytea), 'admin_cancel', 'cancel revokes sessions');
select is(admin_update_student_access('00000000-0000-4000-8000-0000000000ad',
            array[(select id from students where mobile = '01880000001')], 'extend', 7, null, null), 1, 'extend works');

select * from finish();
rollback;
