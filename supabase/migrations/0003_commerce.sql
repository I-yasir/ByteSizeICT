-- 0003 — Commerce & settings (docs/05_Schema.md §4)

create table public.plans (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique check (code ~ '^[a-z0-9-]{2,32}$'),
  name_bn           text not null check (char_length(name_bn) <= 80),
  name_en           text not null check (char_length(name_en) <= 80),
  duration_days     integer check (duration_days between 1 and 1095),
  fixed_expires_at  timestamptz,
  price_bdt         integer not null check (price_bdt between 0 and 1000000),
  features          jsonb not null default '[]'::jsonb,
  is_highlighted    boolean not null default false,
  is_active         boolean not null default true,
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint plans_duration_xor check ((duration_days is null) <> (fixed_expires_at is null))
);

alter table public.students
  add constraint students_plan_fk foreign key (plan_id) references public.plans(id) on delete set null;

create table public.payment_accounts (
  id               uuid primary key default gen_random_uuid(),
  method           public.payment_method not null,
  account_number   text not null check (char_length(account_number) <= 40),
  account_label    text check (char_length(account_label) <= 40),
  account_holder   text check (char_length(account_holder) <= 80),
  instructions_bn  text check (char_length(instructions_bn) <= 1000),
  instructions_en  text check (char_length(instructions_en) <= 1000),
  is_active        boolean not null default true,
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table public.app_settings (
  key         text primary key check (key in ('brand', 'contact', 'homepage', 'faq', 'auth', 'results')),
  value       jsonb not null,
  is_public   boolean not null default false,
  updated_by  uuid references public.admins(id) on delete set null,
  updated_at  timestamptz not null default now()
);

create table public.admissions (
  id                 uuid primary key default gen_random_uuid(),
  kind               public.admission_kind not null,
  mobile             text not null check (mobile ~ '^01[3-9][0-9]{8}$'),
  email              extensions.citext not null check (char_length(email) <= 254),
  payment_method     public.payment_method not null,
  trx_id             text not null check (char_length(trx_id) between 6 and 30),
  trx_id_normalized  text generated always as (upper(regexp_replace(trx_id, '[\s-]', '', 'g'))) stored,
  plan_id            uuid references public.plans(id) on delete set null,
  amount_bdt         integer check (amount_bdt between 0 and 1000000),
  status             public.admission_status not null default 'pending',
  duplicate_flags    jsonb not null default '{}'::jsonb,
  reviewed_by        uuid references public.admins(id) on delete set null,
  reviewed_at        timestamptz,
  reject_reason      text check (char_length(reject_reason) <= 500),
  review_note        text check (char_length(review_note) <= 1000),
  student_id         uuid references public.students(id) on delete set null,
  submitter_ip       inet,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint admissions_review_consistency check (
    (status = 'pending'  and reviewed_at is null) or
    (status = 'approved' and reviewed_at is not null and student_id is not null) or
    (status = 'rejected' and reviewed_at is not null and reject_reason is not null))
);
create unique index admissions_trx_unique_idx     on public.admissions (trx_id_normalized);
create unique index admissions_one_pending_mobile on public.admissions (mobile) where status = 'pending';
create index admissions_status_created_idx        on public.admissions (status, created_at desc);
create index admissions_email_idx                 on public.admissions (email);
create index admissions_student_idx               on public.admissions (student_id);
create index admissions_reviewed_month_idx        on public.admissions (reviewed_at) where status = 'approved';

create trigger plans_updated_at            before update on public.plans            for each row execute function public.set_updated_at();
create trigger payment_accounts_updated_at before update on public.payment_accounts for each row execute function public.set_updated_at();
create trigger app_settings_updated_at     before update on public.app_settings     for each row execute function public.set_updated_at();
create trigger admissions_updated_at       before update on public.admissions       for each row execute function public.set_updated_at();
